export type ExportKind = "svg";
export type CodeFormat = "markup" | "math" | "code";

export type RenderRequest = {
	export: ExportKind;
	format: CodeFormat;
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
