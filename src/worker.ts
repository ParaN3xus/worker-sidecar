import { FONT_BASE_URL, FONT_FILES, GUEST_WASM_URL } from "./config";
import { WasmiSidecar } from "./sidecar";

type RenderPayload = {
  export?: unknown;
  format?: unknown;
  code?: unknown;
};

type RenderResponse = {
  warnings?: Array<{ message?: string }>;
  errors?: Array<{ message?: string }>;
  body?: string | null;
  content_type?: string | null;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
};

let rendererPromise: Promise<WasmiSidecar> | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      return getSvgResponse(request);
    }

    if (request.method === "POST") {
      return postRenderResponse(request);
    }

    return jsonError(405, "only GET and POST are supported");
  },
};

async function getSvgResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/svg") {
    return new Response("not found", { status: 404, headers: TEXT_HEADERS });
  }

  const code = url.searchParams.get("code");
  if (!code || code.trim() === "") {
    return new Response("missing required query parameter: code", {
      status: 400,
      headers: TEXT_HEADERS,
    });
  }

  const response = await renderViaGuest({
    export: "svg",
    format: url.searchParams.get("format") || "markup",
    code,
  });

  if (response.status === 200 && typeof response.payload.body === "string") {
    return new Response(response.payload.body, {
      status: 200,
      headers: {
        "content-type": response.payload.content_type || "image/svg+xml",
      },
    });
  }

  return new Response(diagnosticText(response.payload, "render failed"), {
    status: response.status,
    headers: TEXT_HEADERS,
  });
}

async function postRenderResponse(request: Request): Promise<Response> {
  let payload: RenderPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "request body must be valid json");
  }

  const validationError = validateRenderPayload(payload);
  if (validationError) {
    return jsonError(400, validationError);
  }

  const response = await renderViaGuest(payload as Required<RenderPayload>);
  return new Response(JSON.stringify(response.payload), {
    status: response.status,
    headers: JSON_HEADERS,
  });
}

async function renderViaGuest(payload: {
  export: unknown;
  format: unknown;
  code: unknown;
}): Promise<{ status: number; payload: RenderResponse }> {
  let sidecar: WasmiSidecar;

  try {
    sidecar = await ensureRenderer();
  } catch (error) {
    return {
      status: 500,
      payload: errorPayload(`failed to initialize renderer: ${message(error)}`),
    };
  }

  try {
    const result = sidecar.call("render", [
      encoder.encode(
        JSON.stringify({
          export: payload.export,
          format: payload.format,
          code: payload.code,
        }),
      ),
    ]);
    const parsed = JSON.parse(decoder.decode(result)) as RenderResponse;
    return {
      status: parsed.errors && parsed.errors.length > 0 ? 422 : 200,
      payload: parsed,
    };
  } catch (error) {
    return {
      status: 500,
      payload: errorPayload(`renderer call failed: ${message(error)}`),
    };
  }
}

async function ensureRenderer(): Promise<WasmiSidecar> {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      const sidecar = await WasmiSidecar.load(GUEST_WASM_URL);
      const fonts = await Promise.all(FONT_FILES.map(fetchFont));
      sidecar.call("init", [packFonts(fonts)]);
      return sidecar;
    })().catch((error) => {
      rendererPromise = undefined;
      throw error;
    });
  }

  return rendererPromise;
}

async function fetchFont(name: string): Promise<Uint8Array> {
  const response = await fetch(FONT_BASE_URL + name);
  if (!response.ok) {
    throw new Error(`failed to download font ${name}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function packFonts(fonts: Uint8Array[]): Uint8Array {
  const totalLen = 4 + fonts.reduce((sum, font) => sum + 4 + font.length, 0);
  const bytes = new Uint8Array(totalLen);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  view.setUint32(offset, fonts.length, true);
  offset += 4;

  for (const font of fonts) {
    view.setUint32(offset, font.length, true);
    offset += 4;
    bytes.set(font, offset);
    offset += font.length;
  }

  return bytes;
}

function validateRenderPayload(payload: RenderPayload): string | undefined {
  if (payload.export !== "svg") {
    return "export must be svg";
  }

  if (!["markup", "math", "code"].includes(String(payload.format))) {
    return "format must be one of markup, math, code";
  }

  if (typeof payload.code !== "string" || payload.code.trim() === "") {
    return "code must be a non-empty string";
  }

  return undefined;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify(errorPayload(error)), {
    status,
    headers: JSON_HEADERS,
  });
}

function errorPayload(message: string): RenderResponse {
  return {
    warnings: [],
    errors: [{ message }],
    body: null,
    content_type: null,
  };
}

function diagnosticText(payload: RenderResponse, fallback: string): string {
  const messages: string[] = [];

  for (const warning of payload.warnings ?? []) {
    if (warning.message) {
      messages.push(`warning: ${warning.message}`);
    }
  }

  for (const error of payload.errors ?? []) {
    if (error.message) {
      messages.push(`error: ${error.message}`);
    }
  }

  return messages.length > 0 ? messages.join("\n") : fallback;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

