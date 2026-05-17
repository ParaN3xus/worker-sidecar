import wasmModule from "./index_bg.wasm";

type HostExports = {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  init(ptr: number, len: number): number;
  call(ptr: number, len: number): number;
  result_status(result: number): number;
  result_body_ptr(result: number): number;
  result_body_len(result: number): number;
  free_result(result: number): void;
};

export type GuestSource = string | Uint8Array | ArrayBuffer;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class WasmiSidecar {
  private readonly host: HostExports;

  private constructor() {
    this.host = new WebAssembly.Instance(wasmModule, {}).exports as HostExports;
  }

  static async load(source: GuestSource): Promise<WasmiSidecar> {
    const sidecar = new WasmiSidecar();
    const bytes = await sourceBytes(source);
    sidecar.callHost("init", bytes);
    return sidecar;
  }

  call(name: string, args: Uint8Array[] = []): Uint8Array {
    return this.callHost("call", encodeCall(name, args));
  }

  close(): void {
    // The host owns a single guest session inside this WebAssembly instance.
    // Dropping this JS object lets the runtime reclaim the instance.
  }

  private callHost(entryPoint: "init" | "call", bytes: Uint8Array): Uint8Array {
    const ptr = this.host.alloc(bytes.length);
    let result = 0;

    try {
      new Uint8Array(this.host.memory.buffer, ptr, bytes.length).set(bytes);
      result = this.host[entryPoint](ptr, bytes.length);
      return this.readResult(result);
    } finally {
      this.host.dealloc(ptr, bytes.length);
      if (result) {
        this.host.free_result(result);
      }
    }
  }

  private readResult(result: number): Uint8Array {
    const status = this.host.result_status(result);
    const ptr = this.host.result_body_ptr(result);
    const len = this.host.result_body_len(result);
    const body = new Uint8Array(this.host.memory.buffer, ptr, len).slice();

    if (status !== 200) {
      throw new Error(decoder.decode(body) || `sidecar host returned ${status}`);
    }

    return body;
  }
}

async function sourceBytes(source: GuestSource): Promise<Uint8Array> {
  if (typeof source === "string") {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`failed to download guest wasm: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  return source instanceof Uint8Array ? source : new Uint8Array(source);
}

function encodeCall(name: string, args: Uint8Array[]): Uint8Array {
  const nameBytes = encoder.encode(name);
  const totalLen =
    4 +
    nameBytes.length +
    4 +
    args.reduce((sum, arg) => sum + 4 + arg.length, 0);
  const bytes = new Uint8Array(totalLen);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  view.setUint32(offset, nameBytes.length, true);
  offset += 4;
  bytes.set(nameBytes, offset);
  offset += nameBytes.length;

  view.setUint32(offset, args.length, true);
  offset += 4;

  for (const arg of args) {
    view.setUint32(offset, arg.length, true);
    offset += 4;
    bytes.set(arg, offset);
    offset += arg.length;
  }

  return bytes;
}

