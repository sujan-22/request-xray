import { impressionOf } from "../analysis/impression";
import { RULE_INFO } from "../analysis/rule-info";
import type { Entry } from "../har/entries";
import type { Report } from "../model";
import { Redactor, type RedactionStats } from "../redact/redact";

export const TOOL = { name: "Request X-ray", version: "0.1.0", url: "https://sujanrokad.com" } as const;

export interface ReportExportOptions {
	emails: boolean;
	/** Include request and response headers (redacted). */
	headers: boolean;
}

function redactHeaders(map: Record<string, string>, redactor: Redactor): Record<string, string> {
	return Object.fromEntries(Object.entries(map).map(([name, value]) => [name, redactor.header(name, value)]));
}

/** The report as plain JSON, with every URL, header and subject run through the redactor. Bodies are never included. */
export function buildJsonReport(report: Report, entries: readonly Entry[], options: ReportExportOptions) {
	const redactor = new Redactor({ emails: options.emails });
	const impression = impressionOf(report);
	const data = {
		tool: TOOL,
		generated: new Date().toISOString(),
		source: {
			file: redactor.text(report.meta.fileName),
			size: report.meta.fileSize,
			creator: report.meta.creator,
			browser: report.meta.browser,
		},
		impression: [impression.lead, impression.highlight, impression.tail].filter(Boolean).join(" "),
		settings: report.settings,
		summary: report.summary,
		pages: report.pages.map((page) => ({ ...page, title: redactor.text(page.title) })),
		findings: report.findings.map((finding) => ({
			id: finding.id,
			rule: finding.rule,
			label: RULE_INFO[finding.rule].label,
			severity: finding.severity,
			subject: redactor.text(finding.subject),
			title: redactor.text(finding.title),
			why: finding.why,
			fix: finding.fix,
			impact: finding.impact,
			requests: finding.requestIds,
			...(finding.chain ? { chain: finding.chain } : {}),
		})),
		endpoints: report.endpoints.map((endpoint) => ({
			method: endpoint.method,
			host: endpoint.host,
			pattern: redactor.text(endpoint.pattern),
			type: endpoint.type,
			calls: endpoint.calls,
			variants: endpoint.variants,
			totalTime: Math.round(endpoint.totalTime),
			avgTime: Math.round(endpoint.avgTime),
			maxTime: Math.round(endpoint.maxTime),
			totalTransfer: endpoint.totalTransfer,
			errors: endpoint.errors,
			requests: endpoint.requestIds,
		})),
		requests: entries.map((entry) => ({
			id: entry.id,
			method: entry.method,
			url: redactor.url(entry.url),
			status: entry.status,
			type: entry.type,
			mimeType: entry.mimeType,
			start: round(entry.start),
			duration: round(entry.duration),
			timings: Object.fromEntries(Object.entries(entry.timings).map(([k, v]) => [k, round(v)])),
			transferSize: entry.transferSize,
			contentSize: entry.contentSize,
			encoding: entry.encoding,
			fromCache: entry.fromCache,
			protocol: entry.protocol,
			...(entry.error ? { error: entry.error } : {}),
			...(options.headers
				? { requestHeaders: redactHeaders(entry.reqHeaders, redactor), responseHeaders: redactHeaders(entry.resHeaders, redactor) }
				: {}),
		})),
		redaction: null as RedactionStats | null,
	};
	data.redaction = { ...redactor.stats };
	return data;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
