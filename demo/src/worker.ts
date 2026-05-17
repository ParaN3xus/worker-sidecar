import demoDocSource from "./demo-doc.typ";
import {
	diagnosticText,
	jsonError,
	jsonResponse,
	parseRenderRequest,
	textError,
} from "./http";
import { renderViaGuest } from "./renderer";
import type { Format, Mode, RenderRequest, RenderResponse } from "./types";

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const format = routeFormat(url.pathname);

		if (format instanceof Response) {
			return format;
		}

		if (request.method === "GET") {
			return getRenderResponse(url, format);
		}

		if (request.method === "POST") {
			return postRenderResponse(request, format);
		}

		return jsonError(405, "only GET and POST are supported");
	},
};

function routeFormat(pathname: string): Format | undefined | Response {
	if (pathname === "/") {
		return undefined;
	}

	if (pathname === "/svg") {
		return "svg";
	}

	if (pathname === "/pdf") {
		return "pdf";
	}

	if (pathname === "/png") {
		return "png";
	}

	return textError(404, "not found");
}

async function getRenderResponse(
	url: URL,
	format: Format | undefined,
): Promise<Response> {
	const payload = queryRenderRequest(url, format);
	if (payload instanceof Response) {
		if (url.pathname === "/" && format === undefined) {
			return demoDocResponse();
		}
		return payload;
	}

	const result = await renderViaGuest(payload);
	if (result.status === 200 && result.payload.body) {
		return renderResponseBody(result.payload);
	}

	return textError(
		result.status,
		diagnosticText(result.payload, "render failed"),
	);
}

async function demoDocResponse(): Promise<Response> {
	const result = await renderViaGuest({
		format: "pdf",
		mode: "markup",
		code: demoDocSource,
	});

	if (result.status === 200 && result.payload.body) {
		return renderResponseBody(result.payload);
	}

	return textError(
		result.status,
		diagnosticText(result.payload, "failed to render demo document"),
	);
}

async function postRenderResponse(
	request: Request,
	format: Format | undefined,
): Promise<Response> {
	const payload = await parseRenderRequest(request, format);
	if (payload instanceof Response) {
		return payload;
	}

	const result = await renderViaGuest(payload);
	return jsonResponse(result.status, result.payload);
}

function queryRenderRequest(
	url: URL,
	format: Format | undefined,
): RenderRequest | Response {
	const code = url.searchParams.get("code");
	if (!code || code.trim() === "") {
		return textError(400, "missing required query parameter: code");
	}

	const parsedFormat = format ?? queryFormat(url);
	if (!parsedFormat) {
		return textError(400, "missing required query parameter: format");
	}

	return {
		format: parsedFormat,
		mode: queryMode(url),
		code,
	};
}

function queryFormat(url: URL): Format | undefined {
	const format = url.searchParams.get("format");
	return format === "svg" || format === "pdf" || format === "png"
		? format
		: undefined;
}

function queryMode(url: URL): Mode {
	const mode = url.searchParams.get("mode");
	return mode === "math" || mode === "code" ? mode : "markup";
}

function renderBody(payload: RenderResponse): BodyInit {
	if (payload.body === null) {
		return "";
	}

	if (
		payload.content_type === "application/pdf" ||
		payload.content_type === "image/png"
	) {
		return decodeBase64(payload.body);
	}

	return payload.body;
}

function renderResponseBody(payload: RenderResponse): Response {
	return new Response(renderBody(payload), {
		status: 200,
		headers: {
			"content-type": payload.content_type ?? "application/octet-stream",
		},
	});
}

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}
