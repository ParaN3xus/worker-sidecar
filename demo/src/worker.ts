import {
	diagnosticText,
	jsonError,
	jsonResponse,
	parseRenderRequest,
	textError,
} from "./http";
import { renderViaGuest } from "./renderer";
import type { Mode, RenderRequest } from "./types";

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname !== "/svg") {
			return textError(404, "not found");
		}

		if (request.method === "GET") {
			return getSvgResponse(url);
		}

		if (request.method === "POST") {
			return postSvgResponse(request);
		}

		return jsonError(405, "only GET and POST are supported");
	},
};

async function getSvgResponse(url: URL): Promise<Response> {
	const payload = queryRenderRequest(url);
	if (payload instanceof Response) {
		return payload;
	}

	const result = await renderViaGuest(payload);
	if (result.status === 200 && result.payload.body) {
		return new Response(result.payload.body, {
			status: 200,
			headers: {
				"content-type": result.payload.content_type ?? "image/svg+xml",
			},
		});
	}

	return textError(
		result.status,
		diagnosticText(result.payload, "render failed"),
	);
}

async function postSvgResponse(request: Request): Promise<Response> {
	const payload = await parseRenderRequest(request);
	if (payload instanceof Response) {
		return payload;
	}

	const result = await renderViaGuest(payload);
	return jsonResponse(result.status, result.payload);
}

function queryRenderRequest(url: URL): RenderRequest | Response {
	const code = url.searchParams.get("code");
	if (!code || code.trim() === "") {
		return textError(400, "missing required query parameter: code");
	}

	return {
		format: "svg",
		mode: queryMode(url),
		code,
	};
}

function queryMode(url: URL): Mode {
	const mode = url.searchParams.get("mode");
	return mode === "math" || mode === "code" ? mode : "markup";
}
