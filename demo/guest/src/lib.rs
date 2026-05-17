use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use typst::diag::{FileError, FileResult, Severity, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime};
use typst::layout::Abs;
use typst::layout::PagedDocument;
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use wasm_minimal_protocol::wasm_func;

#[cfg(target_arch = "wasm32")]
wasm_minimal_protocol::initiate_protocol!();

const MAIN_PATH: &str = "/main.typ";

static WORLD: Mutex<Option<WorkerWorld>> = Mutex::new(None);

struct WorkerWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    source: Source,
    source_bytes: Bytes,
    main: FileId,
}

impl WorkerWorld {
    fn new(fonts: Vec<Font>) -> Self {
        let main = FileId::new(None, VirtualPath::new(MAIN_PATH));
        let book = FontBook::from_fonts(fonts.iter());

        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(book),
            fonts,
            source: Source::new(main, String::new()),
            source_bytes: Bytes::new(Vec::new()),
            main,
        }
    }

    fn set_source(&mut self, source_text: String) {
        self.source_bytes = Bytes::from_string(source_text.clone());
        self.source = Source::new(self.main, source_text);
    }
}

impl World for WorkerWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main {
            Ok(self.source.clone())
        } else {
            Err(FileError::NotFound(PathBuf::from(
                id.vpath().as_rooted_path(),
            )))
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.main {
            Ok(self.source_bytes.clone())
        } else {
            Err(FileError::NotFound(PathBuf::from(
                id.vpath().as_rooted_path(),
            )))
        }
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        Datetime::from_ymd(1970, 1, 1)
    }
}

#[derive(Deserialize)]
struct RenderRequest {
    export: String,
    format: String,
    code: String,
}

#[derive(Serialize)]
struct RenderResponse {
    warnings: Vec<Diagnostic>,
    errors: Vec<Diagnostic>,
    body: Option<String>,
    content_type: Option<&'static str>,
}

#[derive(Serialize)]
struct Diagnostic {
    severity: &'static str,
    message: String,
}

#[cfg_attr(target_arch = "wasm32", wasm_func)]
fn init(font_package: &[u8]) -> Result<Vec<u8>, String> {
    let fonts = parse_font_package(font_package)?;
    let mut world = WORLD
        .lock()
        .map_err(|_| "failed to lock Typst world".to_owned())?;
    *world = Some(WorkerWorld::new(fonts));
    Ok(br#"{"status":"initialized"}"#.to_vec())
}

#[cfg_attr(target_arch = "wasm32", wasm_func)]
fn render(request: &[u8]) -> Result<Vec<u8>, String> {
    let request: RenderRequest = serde_json::from_slice(request)
        .map_err(|err| format!("render request must be valid json: {err}"))?;

    if request.export != "svg" {
        return Ok(json_response(RenderResponse {
            warnings: vec![],
            errors: vec![Diagnostic {
                severity: "error",
                message: "only svg export is implemented".to_owned(),
            }],
            body: None,
            content_type: None,
        }));
    }

    if request.code.trim().is_empty() {
        return Ok(json_response(RenderResponse {
            warnings: vec![],
            errors: vec![Diagnostic {
                severity: "error",
                message: "code must be a non-empty string".to_owned(),
            }],
            body: None,
            content_type: None,
        }));
    }

    let source = format_typst_source(&request.format, &request.code)?;
    let mut world = WORLD
        .lock()
        .map_err(|_| "failed to lock Typst world".to_owned())?;
    let world = world
        .as_mut()
        .ok_or_else(|| "Typst world has not been initialized".to_owned())?;

    Ok(render_world(world, source))
}

fn render_world(world: &mut WorkerWorld, source: String) -> Vec<u8> {
    world.set_source(source);
    let warned = typst::compile::<PagedDocument>(&*world);
    let warnings = diagnostics(warned.warnings.iter());

    match warned.output {
        Ok(document) => {
            let svg = typst_svg::svg_merged(&document, Abs::zero());
            json_response(RenderResponse {
                warnings,
                errors: vec![],
                body: Some(svg),
                content_type: Some("image/svg+xml"),
            })
        }
        Err(errors) => json_response(RenderResponse {
            warnings,
            errors: diagnostics(errors.iter()),
            body: None,
            content_type: None,
        }),
    }
}

fn format_typst_source(format: &str, code: &str) -> Result<String, String> {
    match format {
        "markup" => Ok(code.to_owned()),
        "math" => Ok(format!("$ {code} $")),
        "code" => Ok(format!("```typc\n{code}\n```")),
        _ => Err("format must be one of markup, math, code".to_owned()),
    }
}

fn diagnostics<'a>(
    diagnostics: impl Iterator<Item = &'a SourceDiagnostic>,
) -> Vec<Diagnostic> {
    diagnostics
        .map(|diagnostic| Diagnostic {
            severity: match diagnostic.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            },
            message: diagnostic.message.to_string(),
        })
        .collect()
}

fn parse_font_package(input: &[u8]) -> Result<Vec<Font>, String> {
    let mut offset = 0;
    let count = read_u32(input, &mut offset)? as usize;
    let mut fonts = Vec::new();

    for _ in 0..count {
        let len = read_u32(input, &mut offset)? as usize;
        if input.len().saturating_sub(offset) < len {
            return Err("font package ended inside font bytes".to_owned());
        }

        let bytes = Bytes::new(input[offset..offset + len].to_vec());
        fonts.extend(Font::iter(bytes));
        offset += len;
    }

    if offset != input.len() {
        return Err("font package has trailing bytes".to_owned());
    }

    if fonts.is_empty() {
        return Err("no usable fonts were provided".to_owned());
    }

    Ok(fonts)
}

fn read_u32(input: &[u8], offset: &mut usize) -> Result<u32, String> {
    if input.len().saturating_sub(*offset) < 4 {
        return Err("font package ended unexpectedly".to_owned());
    }

    let mut bytes = [0; 4];
    bytes.copy_from_slice(&input[*offset..*offset + 4]);
    *offset += 4;
    Ok(u32::from_le_bytes(bytes))
}

fn json_response(response: RenderResponse) -> Vec<u8> {
    serde_json::to_vec(&response).unwrap_or_else(|_| {
        br#"{"warnings":[],"errors":[{"severity":"error","message":"failed to serialize response"}],"body":null,"content_type":null}"#.to_vec()
    })
}
