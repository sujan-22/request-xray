import type { HarErrorCode } from "../har/parse";
import type { Report, Settings } from "../model";
import type { RedactionStats } from "../redact/redact";
import type { RequestDetail } from "./detail";
import type { RequestDiff } from "./request-diff";

export type Stage = "reading" | "parsing" | "analyzing";

export type ExportFormat = "html" | "json" | "har";

export interface ExportOptions {
	emails: boolean;
	/** JSON report: include redacted request and response headers. */
	headers: boolean;
	/** Sanitized HAR: keep response bodies (redacted). */
	responseBodies: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { emails: true, headers: false, responseBodies: false };

export type WorkerRequest =
	| { id: number; type: "load"; file: Blob; name: string; settings: Settings }
	| { id: number; type: "settings"; settings: Settings }
	| { id: number; type: "detail"; requestId: number }
	| { id: number; type: "diff"; a: number; b: number }
	| { id: number; type: "export"; format: ExportFormat; options: ExportOptions };

export interface WorkerError {
	code: HarErrorCode | "too-large" | "read-failed" | "internal";
	message: string;
	detail?: string;
}

export type WorkerResponse =
	| { id: number; type: "progress"; stage: Stage; loaded: number; total: number }
	| { id: number; type: "report"; report: Report }
	| { id: number; type: "detail"; detail: RequestDetail }
	| { id: number; type: "diff"; diff: RequestDiff }
	| { id: number; type: "export"; blob: Blob; fileName: string; stats: RedactionStats }
	| { id: number; type: "error"; error: WorkerError };
