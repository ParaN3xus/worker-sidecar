use std::collections::HashMap;
use std::sync::Mutex;

use wasmi::{Caller, Engine, Extern, Func, Linker, Module, Store, Val, ValType};

static GUEST_STATE: Mutex<Option<GuestState>> = Mutex::new(None);

struct GuestState {
    store: Store<StoreData>,
    functions: HashMap<String, Func>,
}

#[derive(Default)]
struct StoreData {
    args: Vec<Vec<u8>>,
    output: Vec<u8>,
    memory_error: Option<MemoryError>,
}

struct MemoryError {
    offset: u32,
    length: u32,
    write: bool,
}

pub struct HostResult {
    status: u16,
    body: Vec<u8>,
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }
}

#[no_mangle]
pub unsafe extern "C" fn init(ptr: *const u8, len: usize) -> *mut HostResult {
    let result = match input_slice(ptr, len).and_then(init_guest) {
        Ok(result) => result,
        Err(result) => result,
    };

    Box::into_raw(Box::new(result))
}

#[no_mangle]
pub unsafe extern "C" fn call(ptr: *const u8, len: usize) -> *mut HostResult {
    let result = match input_slice(ptr, len)
        .and_then(parse_call)
        .and_then(call_guest)
    {
        Ok(result) => result,
        Err(result) => result,
    };

    Box::into_raw(Box::new(result))
}

#[no_mangle]
pub unsafe extern "C" fn result_status(result: *const HostResult) -> u16 {
    result.as_ref().map_or(500, |result| result.status)
}

#[no_mangle]
pub unsafe extern "C" fn result_body_ptr(result: *const HostResult) -> *const u8 {
    result
        .as_ref()
        .map_or(std::ptr::null(), |result| result.body.as_ptr())
}

#[no_mangle]
pub unsafe extern "C" fn result_body_len(result: *const HostResult) -> usize {
    result.as_ref().map_or(0, |result| result.body.len())
}

#[no_mangle]
pub unsafe extern "C" fn free_result(result: *mut HostResult) {
    if !result.is_null() {
        drop(Box::from_raw(result));
    }
}

unsafe fn input_slice<'a>(ptr: *const u8, len: usize) -> Result<&'a [u8], HostResult> {
    if ptr.is_null() {
        return Err(error_response(400, "input pointer must not be null"));
    }

    Ok(std::slice::from_raw_parts(ptr, len))
}

fn init_guest(wasm_bytes: &[u8]) -> Result<HostResult, HostResult> {
    let engine = Engine::default();
    let module = Module::new(&engine, wasm_bytes)
        .map_err(|err| error_response(400, format!("failed to load guest wasm: {err}")))?;

    let mut linker = Linker::new(&engine);
    linker
        .func_wrap(
            "typst_env",
            "wasm_minimal_protocol_write_args_to_buffer",
            wasm_minimal_protocol_write_args_to_buffer,
        )
        .map_err(|err| error_response(500, format!("failed to link arg writer: {err}")))?;
    linker
        .func_wrap(
            "typst_env",
            "wasm_minimal_protocol_send_result_to_host",
            wasm_minimal_protocol_send_result_to_host,
        )
        .map_err(|err| error_response(500, format!("failed to link result sender: {err}")))?;

    let mut store = Store::new(&engine, StoreData::default());
    let instance = linker
        .instantiate_and_start(&mut store, &module)
        .map_err(|err| error_response(400, format!("failed to instantiate guest wasm: {err}")))?;

    if !matches!(instance.get_export(&store, "memory"), Some(Extern::Memory(_))) {
        return Err(error_response(400, "guest wasm does not export memory"));
    }

    let functions = instance
        .exports(&store)
        .filter_map(|export| {
            let name = export.name().to_owned();
            export.into_func().map(|func| (name, func))
        })
        .collect::<HashMap<_, _>>();

    let mut state = GUEST_STATE
        .lock()
        .map_err(|_| error_response(500, "failed to lock guest state"))?;
    *state = Some(GuestState { store, functions });

    Ok(text_response(200, "guest wasm loaded"))
}

struct CallInput {
    name: String,
    args: Vec<Vec<u8>>,
}

fn parse_call(input: &[u8]) -> Result<CallInput, HostResult> {
    let mut offset = 0;
    let name_len = read_u32(input, &mut offset)? as usize;

    if input.len().saturating_sub(offset) < name_len {
        return Err(error_response(400, "call input ended inside function name"));
    }
    let name = std::str::from_utf8(&input[offset..offset + name_len])
        .map_err(|_| error_response(400, "function name must be utf-8"))?
        .to_owned();
    offset += name_len;

    let arg_count = read_u32(input, &mut offset)? as usize;
    let mut args = Vec::with_capacity(arg_count);

    for _ in 0..arg_count {
        let len = read_u32(input, &mut offset)? as usize;
        if input.len().saturating_sub(offset) < len {
            return Err(error_response(400, "call input ended inside argument"));
        }
        args.push(input[offset..offset + len].to_vec());
        offset += len;
    }

    if offset != input.len() {
        return Err(error_response(400, "call input has trailing bytes"));
    }

    Ok(CallInput { name, args })
}

fn read_u32(input: &[u8], offset: &mut usize) -> Result<u32, HostResult> {
    if input.len().saturating_sub(*offset) < 4 {
        return Err(error_response(400, "call input ended unexpectedly"));
    }
    let mut bytes = [0u8; 4];
    bytes.copy_from_slice(&input[*offset..*offset + 4]);
    *offset += 4;
    Ok(u32::from_le_bytes(bytes))
}

fn call_guest(input: CallInput) -> Result<HostResult, HostResult> {
    let mut state = GUEST_STATE
        .lock()
        .map_err(|_| error_response(500, "failed to lock guest state"))?;
    let state = state
        .as_mut()
        .ok_or_else(|| error_response(503, "guest wasm has not been loaded"))?;

    let func = state
        .functions
        .get(&input.name)
        .copied()
        .ok_or_else(|| error_response(404, format!("guest function `{}` not found", input.name)))?;

    let ty = func.ty(&state.store);
    if ty.params().iter().any(|param| param != &ValType::I32) {
        return Err(error_response(
            400,
            format!("guest function `{}` has non-i32 parameter", input.name),
        ));
    }
    if ty.results() != [ValType::I32] {
        return Err(error_response(
            400,
            format!("guest function `{}` must return exactly one i32", input.name),
        ));
    }

    let expected = ty.params().len();
    if expected != input.args.len() {
        return Err(error_response(
            400,
            format!(
                "guest function `{}` expects {} args, got {}",
                input.name,
                expected,
                input.args.len()
            ),
        ));
    }

    let params = input
        .args
        .iter()
        .map(|arg| Val::I32(arg.len() as i32))
        .collect::<Vec<_>>();
    state.store.data_mut().args = input.args;
    state.store.data_mut().output.clear();
    state.store.data_mut().memory_error = None;

    let mut results = [Val::I32(-1)];
    func.call(&mut state.store, &params, &mut results)
        .map_err(|err| error_response(500, format!("guest function trapped: {err}")))?;

    if let Some(memory_error) = state.store.data_mut().memory_error.take() {
        return Err(error_response(
            500,
            format!(
                "guest tried to {} out of bounds at {:#x} for {} bytes",
                if memory_error.write { "write" } else { "read" },
                memory_error.offset,
                memory_error.length
            ),
        ));
    }

    let output = std::mem::take(&mut state.store.data_mut().output);
    match results[0] {
        Val::I32(0) => Ok(binary_response(200, output)),
        Val::I32(1) => Err(error_response(
            422,
            std::str::from_utf8(&output).unwrap_or("guest returned a non-utf8 error"),
        )),
        _ => Err(error_response(500, "guest did not respect minimal protocol")),
    }
}

fn wasm_minimal_protocol_write_args_to_buffer(mut caller: Caller<StoreData>, ptr: u32) {
    let Some(memory) = caller.get_export("memory").and_then(|export| export.into_memory()) else {
        caller.data_mut().memory_error =
            Some(MemoryError { offset: ptr, length: 0, write: true });
        return;
    };

    let args = std::mem::take(&mut caller.data_mut().args);
    let mut offset = ptr as usize;

    for arg in args {
        if memory.write(&mut caller, offset, arg.as_slice()).is_err() {
            caller.data_mut().memory_error = Some(MemoryError {
                offset: offset as u32,
                length: arg.len() as u32,
                write: true,
            });
            return;
        }
        offset += arg.len();
    }
}

fn wasm_minimal_protocol_send_result_to_host(
    mut caller: Caller<StoreData>,
    ptr: u32,
    len: u32,
) {
    let Some(memory) = caller.get_export("memory").and_then(|export| export.into_memory()) else {
        caller.data_mut().memory_error =
            Some(MemoryError { offset: ptr, length: len, write: false });
        return;
    };

    let mut output = vec![0u8; len as usize];
    if memory.read(&caller, ptr as usize, &mut output).is_err() {
        caller.data_mut().memory_error =
            Some(MemoryError { offset: ptr, length: len, write: false });
        return;
    }
    caller.data_mut().output = output;
}

fn text_response(status: u16, body: impl AsRef<str>) -> HostResult {
    binary_response(status, body.as_ref().as_bytes().to_vec())
}

fn error_response(status: u16, message: impl AsRef<str>) -> HostResult {
    text_response(status, message)
}

fn binary_response(status: u16, body: Vec<u8>) -> HostResult {
    HostResult { status, body }
}
