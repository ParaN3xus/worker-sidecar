import type { CodeFormat, RenderRequest, RenderResponse } from "./types";

export const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
};

export const TEXT_HEADERS = {
	"content-type": "text/plain; charset=utf-8",
};

const FORMATS = new Set<CodeFormat>(["markup", "math", "code"]);

export async function parseRenderRequest(
	request: Request,
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

	if (body.export !== "svg") {
		return jsonError(400, "export must be svg");
	}

	if (
		typeof body.format !== "string" ||
		!FORMATS.has(body.format as CodeFormat)
	) {
		return jsonError(400, "format must be one of markup, math, code");
	}

	if (typeof body.code !== "string" || body.code.trim() === "") {
		return jsonError(400, "code must be a non-empty string");
	}

	return {
		export: body.export,
		format: body.format as CodeFormat,
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
