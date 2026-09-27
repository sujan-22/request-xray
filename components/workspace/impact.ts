import { formatBytes, formatMs } from "@/lib/format";
import type { Finding } from "@/lib/model";

/** The headline number on a finding card, in words that fit the rule. */
export function impactLabel(finding: Finding): { value: string; caption: string } | null {
	const { ms, bytes } = finding.impact;
	const n = finding.requestIds.length;
	switch (finding.rule) {
		case "duplicate":
			return { value: formatMs(ms), caption: "wasted" };
		case "chatty":
		case "sequential":
			return ms > 0 ? { value: formatMs(ms), caption: "to save" } : null;
		case "slow":
			return { value: formatMs(ms), caption: "over limit" };
		case "no-compression":
			return { value: formatBytes(bytes), caption: "to save" };
		case "no-cache":
			return { value: formatBytes(bytes), caption: "uncached" };
		case "large-response":
		case "odata-overfetch":
			return { value: formatBytes(bytes), caption: "on the wire" };
		case "errors":
			return { value: String(n), caption: n === 1 ? "request" : "requests" };
	}
}
