import { formatBytes, plural } from "../../format";
import type { Entry } from "../../har/entries";
import type { Finding, Severity } from "../../model";
import { bytesOf, sum, type Rule } from "../context";

const STATIC = new Set(["script", "style", "font", "image"]);

export function hasCachePolicy(entry: Entry): boolean {
	return Boolean(entry.resHeaders["cache-control"] || entry.resHeaders["expires"]);
}

function severityFor(bytes: number): Severity {
	return bytes >= 1_000_000 ? "medium" : "low";
}

/** Static files served without Cache-Control or Expires, grouped by host. */
export const noCacheRule: Rule = ({ entries }) => {
	const byHost = new Map<string, Entry[]>();
	for (const entry of entries) {
		if (!STATIC.has(entry.type) || entry.method !== "GET") continue;
		if (entry.status !== 200 || entry.fromCache) continue;
		if (hasCachePolicy(entry)) continue;
		const group = byHost.get(entry.host);
		if (group) group.push(entry);
		else byHost.set(entry.host, [entry]);
	}

	const findings: Finding[] = [];
	for (const [host, group] of byHost) {
		const bytes = sum(group.map(bytesOf));
		const hashed = group.some((entry) => /[.\-_][a-f0-9]{8,}\./i.test(entry.name));
		findings.push({
			id: `no-cache:${host}`,
			rule: "no-cache",
			severity: severityFor(bytes),
			subject: host,
			title: `served ${group.length === 1 ? "a static file" : plural(group.length, "static file")} without cache headers`,
			why: `With no Cache-Control or Expires header, browsers guess how long to keep a file, or fetch it again on the next visit. Repeat visits could pay for these ${formatBytes(bytes)} again.`,
			fix: hashed
				? "Send Cache-Control on static files. Files with a content hash in the name can use \"public, max-age=31536000, immutable\"; others can use a shorter max-age plus an ETag."
				: "Send Cache-Control on static files, for example \"public, max-age=86400\" with an ETag. Adding a content hash to file names lets you cache them for a year safely.",
			requestIds: group.map((entry) => entry.id),
			impact: { ms: 0, bytes },
		});
	}
	return findings;
};
