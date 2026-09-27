import { formatCount, formatMs, plural } from "../format";
import type { Finding, Report } from "../model";

/**
 * The one-sentence reading at the top of a report, like the "impression" line
 * of a radiology report: what happened, and the single thing most worth fixing.
 */
export interface Impression {
	lead: string;
	highlight: string | null;
	tail: string | null;
}

/** "GET /Commerce/Products({key})?api-version" → "Products({key})"; "GET /v1/items/{n}" → "items/{n}" */
export function shortSubject(subject: string): string {
	const path = subject.replace(/^[A-Z]+\s+/, "").split("?")[0]!;
	const segments = path.split("/").filter(Boolean);
	const last = segments[segments.length - 1];
	if (!last) return path;
	if (/^\{[a-z]+\}$/.test(last) && segments.length > 1) return `${segments[segments.length - 2]}/${last}`;
	return last;
}

export function headline(finding: Finding): string {
	const short = shortSubject(finding.subject);
	const n = finding.requestIds.length;
	switch (finding.rule) {
		case "duplicate":
			return finding.title.startsWith("repeated") ? `${short} ${finding.title}` : `${short} ran ${formatCount(n)} times with the same request`;
		case "chatty":
			return `${short} was called ${formatCount(n)} times, once per id`;
		case "sequential":
			return `${n} API calls waited on each other, costing about ${formatMs(finding.impact.ms)}`;
		case "no-compression":
			return `${finding.subject} ${finding.title}`;
		case "no-cache":
			return `${plural(n, "static file")} from ${finding.subject} have no cache headers`;
		default:
			return `${short} ${finding.title}`;
	}
}

export function impressionOf(report: Pick<Report, "summary" | "findings">): Impression {
	const { summary, findings } = report;
	const hosts = summary.hosts === 1 ? "one host" : `${summary.hosts} hosts`;
	const lead = `${plural(summary.requests, "request")} to ${hosts} over ${formatMs(summary.duration)}.`;
	const [top, ...rest] = findings;
	if (!top) return { lead, highlight: null, tail: "Nothing stood out at the current thresholds." };

	const high = rest.filter((f) => f.severity === "high").length;
	const tail = rest.length
		? `${plural(rest.length, "more finding")}${high ? `, ${high} of them high severity` : ""}.`
		: "That's the only finding.";
	return { lead, highlight: `${headline(top)}.`, tail };
}
