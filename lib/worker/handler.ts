import { buildReport, prepare, type Prepared } from "../analysis/analyze";
import { buildHtmlReport } from "../export/html-report";
import { buildJsonReport } from "../export/json-report";
import { sanitizeHar } from "../export/sanitize-har";
import { HarError, parseHar } from "../har/parse";
import type { Har } from "../har/types";
import { DEFAULT_SETTINGS, type Report, type Settings } from "../model";
import { Redactor } from "../redact/redact";
import { buildDetail } from "./detail";
import type { Stage, WorkerError, WorkerRequest, WorkerResponse } from "./protocol";
import { buildRequestDiff } from "./request-diff";

type Post = (message: WorkerResponse) => void;

interface State {
	har: Har;
	prepared: Prepared;
	report: Report;
	fileName: string;
	fileSize: number;
	parseMs: number;
}

const now = () => performance.now();

/** Read a Blob as text, reporting progress as bytes arrive. */
async function readText(file: Blob, onProgress: (loaded: number) => void): Promise<string> {
	if (typeof file.stream !== "function") return file.text();
	const reader = file.stream().getReader();
	const decoder = new TextDecoder();
	const parts: string[] = [];
	let loaded = 0;
	let lastReport = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		loaded += value.byteLength;
		parts.push(decoder.decode(value, { stream: true }));
		const t = now();
		if (t - lastReport > 40) {
			onProgress(loaded);
			lastReport = t;
		}
	}
	parts.push(decoder.decode());
	onProgress(loaded);
	return parts.join("");
}

function toError(error: unknown, size: number): WorkerError {
	if (error instanceof HarError) return { code: error.code, message: error.message, detail: error.detail };
	if (error instanceof RangeError || (error instanceof Error && /allocation|out of memory|Invalid string length/i.test(error.message))) {
		return {
			code: "too-large",
			message: `This file (${Math.round(size / 1e6)} MB) is too large for this browser tab to parse.`,
			detail: "Record a shorter session, or export without response bodies, and try again.",
		};
	}
	return { code: "internal", message: "Something went wrong while analysing the file.", detail: error instanceof Error ? error.message : String(error) };
}

function baseName(name: string): string {
	return name.replace(/\.(har|json)$/i, "") || "capture";
}

/** The worker's message handler, kept free of worker globals so it can be tested. */
export function createHandler(post: Post) {
	let state: State | null = null;
	let settings: Settings = DEFAULT_SETTINGS;

	const progress = (id: number, stage: Stage, loaded = 0, total = 0) => post({ id, type: "progress", stage, loaded, total });

	return async function handle(message: WorkerRequest): Promise<void> {
		const { id } = message;
		try {
			switch (message.type) {
				case "load": {
					settings = { ...DEFAULT_SETTINGS, ...message.settings };
					const total = message.file.size;
					progress(id, "reading", 0, total);
					const text = await readText(message.file, (loaded) => progress(id, "reading", loaded, total));
					progress(id, "parsing", total, total);
					const parseStart = now();
					const har = parseHar(text);
					const parseMs = Math.round(now() - parseStart);
					progress(id, "analyzing", total, total);
					const prepareStart = now();
					const prepared = prepare(har);
					const report = buildReport(prepared, har, {
						fileName: message.name,
						fileSize: total,
						settings,
						parseMs,
						prepareMs: now() - prepareStart,
					});
					state = { har, prepared, report, fileName: message.name, fileSize: total, parseMs };
					post({ id, type: "report", report });
					return;
				}
				case "settings": {
					settings = { ...DEFAULT_SETTINGS, ...message.settings };
					if (!state) return;
					const report = buildReport(state.prepared, state.har, {
						fileName: state.fileName,
						fileSize: state.fileSize,
						settings,
						parseMs: state.parseMs,
					});
					state.report = report;
					post({ id, type: "report", report });
					return;
				}
				case "detail": {
					const entry = state?.prepared.entries[message.requestId];
					if (!entry) throw new Error(`No request #${message.requestId}`);
					post({ id, type: "detail", detail: buildDetail(entry) });
					return;
				}
				case "diff": {
					const a = state?.prepared.entries[message.a];
					const b = state?.prepared.entries[message.b];
					if (!a || !b) throw new Error("Pick two requests to compare.");
					post({ id, type: "diff", diff: buildRequestDiff(a, b) });
					return;
				}
				case "export": {
					if (!state) throw new Error("Load a HAR file first.");
					const name = baseName(state.fileName);
					if (message.format === "har") {
						const { har, redactor } = sanitizeHar(state.har, message.options);
						const blob = new Blob([JSON.stringify(har, null, 2)], { type: "application/json" });
						post({ id, type: "export", blob, fileName: `${name}.sanitized.har`, stats: redactor.stats });
						return;
					}
					if (message.format === "json") {
						const data = buildJsonReport(state.report, state.prepared.entries, message.options);
						const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
						post({ id, type: "export", blob, fileName: `${name}.xray.json`, stats: data.redaction! });
						return;
					}
					const redactor = new Redactor({ emails: message.options.emails });
					const html = buildHtmlReport(state.report, state.prepared.entries, message.options, redactor);
					post({ id, type: "export", blob: new Blob([html], { type: "text/html" }), fileName: `${name}.xray.html`, stats: redactor.stats });
					return;
				}
			}
		} catch (error) {
			post({ id, type: "error", error: toError(error, message.type === "load" ? message.file.size : 0) });
		}
	};
}
