import {
	diagnosticText,
	jsonError,
	jsonResponse,
	parseRenderRequest,
	textError,
} from "./http";
import { renderViaGuest } from "./renderer";
import type { Format, Mode, RenderRequest } from "./types";

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

	return textError(404, "not found");
}

async function getRenderResponse(
	url: URL,
	format: Format | undefined,
): Promise<Response> {
	const payload = queryRenderRequest(url, format);
	if (payload instanceof Response) {
		return payload;
	}

	const result = await renderViaGuest(payload);
	if (result.status === 200 && result.payload.body) {
		return new Response(result.payload.body, {
			status: 200,
			headers: {
				"content-type":
					result.payload.content_type ?? "application/octet-stream",
			},
		});
	}

	return textError(
		result.status,
		diagnosticText(result.payload, "render failed"),
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
	return url.searchParams.get("format") === "svg" ? "svg" : undefined;
}

function queryMode(url: URL): Mode {
	const mode = url.searchParams.get("mode");
	return mode === "math" || mode === "code" ? mode : "markup";
}
