import type { Format, Mode, RenderRequest, RenderResponse } from "./types";

export const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
};

export const TEXT_HEADERS = {
	"content-type": "text/plain; charset=utf-8",
};

const MODES = new Set<Mode>(["markup", "math", "code"]);
const FORMATS = new Set<Format>(["svg", "pdf", "png"]);

export async function parseRenderRequest(
	request: Request,
	format: Format | undefined,
): Promise<RenderRequest | Response> {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return jsonError(400, "request body must be valid json");
	}

	if (!isRecord(body)) {
		return jsonError(400, "request body must be a json object");
	}

	const parsedFormat = format ?? body.format;
	if (
		typeof parsedFormat !== "string" ||
		!FORMATS.has(parsedFormat as Format)
	) {
		return jsonError(400, "format must be one of svg, pdf, png");
	}

	if (typeof body.mode !== "string" || !MODES.has(body.mode as Mode)) {
		return jsonError(400, "mode must be one of markup, math, code");
	}

	if (typeof body.code !== "string" || body.code.trim() === "") {
		return jsonError(400, "code must be a non-empty string");
	}

	return {
		format: parsedFormat as Format,
		mode: body.mode as Mode,
		code: body.code,
	};
}

export function jsonResponse(
	status: number,
	payload: RenderResponse,
): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: JSON_HEADERS,
	});
}

export function jsonError(status: number, error: string): Response {
	return jsonResponse(status, errorPayload(error));
}

export function textError(status: number, error: string): Response {
	return new Response(error, { status, headers: TEXT_HEADERS });
}

export function errorPayload(message: string): RenderResponse {
	return {
		warnings: [],
		errors: [{ message }],
		body: null,
		content_type: null,
	};
}

export function diagnosticText(
	payload: RenderResponse,
	fallback: string,
): string {
	const messages = [
		...payload.warnings
			.filter((warning) => warning.message)
			.map((warning) => `warning: ${warning.message}`),
		...payload.errors
			.filter((error) => error.message)
			.map((error) => `error: ${error.message}`),
	];

	return messages.length > 0 ? messages.join("\n") : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
