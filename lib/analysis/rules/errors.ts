import { formatCount } from "../../format";
import type { Entry } from "../../har/entries";
import type { Finding, Severity } from "../../model";
import { subjectFor, type Rule } from "../context";

type Kind = "server" | "client" | "missing" | "failed" | "aborted";

function kindOf(entry: Entry): Kind | null {
	if (entry.status >= 500) return "server";
	if (entry.status === 404 || entry.status === 410) return "missing";
	if (entry.status >= 400) return "client";
	if (entry.failed) return /ABORTED|CANCELED|CANCELLED/i.test(entry.error ?? "") ? "aborted" : "failed";
	return null;
}

const COPY: Record<Kind, { severity: Severity; why: string; fix: string }> = {
	server: {
		severity: "high",
		why: "The server failed while handling this request, so the page is probably missing data or showing a fallback.",
		fix: "Check the server logs for this endpoint around the time of the capture. Retrying won't help until the underlying error is fixed.",
	},
	client: {
		severity: "medium",
		why: "The server rejected the request. Common causes are an expired token, missing permissions or an invalid parameter.",
		fix: "Compare it with a successful call to the same endpoint (use Compare) to see which header, parameter or body field differs.",
	},
	missing: {
		severity: "medium",
		why: "The file or endpoint doesn't exist at this URL. The browser still paid for the round trip.",
		fix: "Fix or remove the reference. For a missing favicon or source map, add the file or drop the link to it.",
	},
	failed: {
		severity: "medium",
		why: "The request never got a response: it was blocked, the connection failed or the host couldn't be reached.",
		fix: "Check the error in the details panel. Blocked requests often come from ad blockers, CSP or CORS; connection errors point at DNS or the server.",
	},
	aborted: {
		severity: "low",
		why: "The request was cancelled before it finished, often because the page navigated away or the code aborted it.",
		fix: "Usually harmless. If it happens on every load, the call may be started and then thrown away; check whether it's needed at all.",
	},
};

function statusText(entry: Entry): string {
	if (entry.status === 0) return entry.error ? `failed (${entry.error})` : "failed with no response";
	return `returned ${entry.status}${entry.statusText ? ` ${entry.statusText}` : ""}`;
}

/** 4xx, 5xx and failed requests, grouped by endpoint and kind. */
export const errorsRule: Rule = ({ byEndpoint }) => {
	const findings: Finding[] = [];
	for (const [key, group] of byEndpoint) {
		const byKind = new Map<Kind, Entry[]>();
		for (const entry of group) {
			const kind = kindOf(entry);
			if (!kind) continue;
			const list = byKind.get(kind);
			if (list) list.push(entry);
			else byKind.set(kind, [entry]);
		}
		for (const [kind, list] of byKind) {
			const first = list[0]!;
			const copy = COPY[kind];
			findings.push({
				id: `errors:${kind}:${key}`,
				rule: "errors",
				severity: copy.severity,
				subject: subjectFor(list),
				title: list.length === 1 ? statusText(first) : `${statusText(first)} (${formatCount(list.length)} times)`,
				why: copy.why,
				fix: copy.fix,
				requestIds: list.map((entry) => entry.id),
				impact: { ms: 0, bytes: 0 },
				endpoint: key,
			});
		}
	}
	return findings;
};
