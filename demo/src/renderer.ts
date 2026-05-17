import { WasmiSidecar } from "@paran3xus/worker-sidecar";
import { FONT_BASE_URL, FONT_FILES, GUEST_WASM_URL } from "./config";
import { errorPayload } from "./http";
import type { RenderRequest, RenderResponse, RenderResult } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let rendererPromise: Promise<WasmiSidecar> | undefined;

export async function renderViaGuest(
	payload: RenderRequest,
): Promise<RenderResult> {
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
			encoder.encode(JSON.stringify(payload)),
		]);
		const parsed = JSON.parse(decoder.decode(result)) as RenderResponse;
		return {
			status: parsed.errors.length > 0 ? 422 : 200,
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
		rendererPromise = createRenderer().catch((error) => {
			rendererPromise = undefined;
			throw error;
		});
	}

	return rendererPromise;
}

async function createRenderer(): Promise<WasmiSidecar> {
	const sidecar = await WasmiSidecar.load(GUEST_WASM_URL);
	const fonts = await Promise.all(FONT_FILES.map(fetchFont));
	const initialized = sidecar.call("init", [packFonts(fonts)]);

	if (initialized.length !== 1 || initialized[0] !== 1) {
		throw new Error("renderer init returned an unexpected response");
	}

	return sidecar;
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

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
