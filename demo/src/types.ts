export type Format = "svg";
export type Mode = "markup" | "math" | "code";

export type RenderRequest = {
	format: Format;
	mode: Mode;
	code: string;
};

export type Diagnostic = {
	message?: string;
	severity?: string;
};

export type RenderResponse = {
	warnings: Diagnostic[];
	errors: Diagnostic[];
	body: string | null;
	content_type: string | null;
};

export type RenderResult = {
	status: number;
	payload: RenderResponse;
};
