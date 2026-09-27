import { formatBytes, plural } from "../../format";
import type { Entry } from "../../har/entries";
import { isTextMime } from "../../har/headers";
import type { Finding, Severity } from "../../model";
import { sum, type Rule } from "../context";

/** Below this, compression overhead isn't worth it (and most servers skip it). */
export const MIN_COMPRESSIBLE_BYTES = 1024;
/** gzip or Brotli typically removes about 70% of JSON, JS, CSS and HTML. */
export const ESTIMATED_RATIO = 0.7;

/**
 * Was the response compressed on the wire? Checks Content-Encoding first, then
 * HAR's content.compression, then compares wire size with decoded size (for
 * exports that strip headers).
 */
export function isCompressed(entry: Entry): boolean {
	const encoding = entry.encoding;
	if (encoding && encoding !== "identity") return true;
	if ((entry.raw.response?.content?.compression ?? 0) > 0) return true;
	const body = entry.raw.response?.bodySize ?? -1;
	if (body > 0 && body < entry.contentSize * 0.9) return true;
	return false;
}

function severityFor(savedBytes: number): Severity {
	if (savedBytes >= 500_000) return "high";
	if (savedBytes >= 100_000) return "medium";
	return "low";
}

/** Text responses sent without compression, grouped by host (it's a server setting). */
export const noCompressionRule: Rule = ({ entries }) => {
	const byHost = new Map<string, Entry[]>();
	for (const entry of entries) {
		if (entry.status < 200 || entry.status >= 300 || entry.failed || entry.fromCache) continue;
		if (entry.method === "HEAD" || entry.contentSize < MIN_COMPRESSIBLE_BYTES) continue;
		if (!isTextMime(entry.mimeType)) continue;
		if (isCompressed(entry)) continue;
		const group = byHost.get(entry.host);
		if (group) group.push(entry);
		else byHost.set(entry.host, [entry]);
	}

	const findings: Finding[] = [];
	for (const [host, group] of byHost) {
		const size = sum(group.map((entry) => entry.contentSize));
		const saved = Math.round(size * ESTIMATED_RATIO);
		findings.push({
			id: `no-compression:${host}`,
			rule: "no-compression",
			severity: severityFor(saved),
			subject: host,
			title: `sent ${group.length === 1 ? "a text response" : plural(group.length, "text response")} without compression (${formatBytes(size)})`,
			why: `Text such as JSON, JavaScript, CSS and HTML usually shrinks by 70% or more with gzip or Brotli. These responses crossed the network at full size; compressed, they would be about ${formatBytes(size - saved)}.`,
			fix: "Turn on Brotli or gzip on the server or CDN for text content types (application/json, text/javascript, text/css, text/html, image/svg+xml). If it is already on, check that a proxy isn't stripping the Accept-Encoding header.",
			requestIds: group.map((entry) => entry.id),
			impact: { ms: 0, bytes: saved },
		});
	}
	return findings;
};
