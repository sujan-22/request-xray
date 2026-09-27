import { formatBytes, formatCount, formatMs, plural } from "../../format";
import type { Entry } from "../../har/entries";
import type { Finding, Severity } from "../../model";
import { bytesOf, endpointLabel, maxOf, requestLabel, sum, type Rule } from "../context";

const STATIC = new Set(["script", "style", "image", "font"]);
/** More duplicate groups than this on one endpoint are rolled into a single finding. */
export const ROLLUP_AFTER = 3;

function severityFor(entry: Entry, count: number, wastedMs: number): Severity {
	if (STATIC.has(entry.type)) return count >= 4 ? "medium" : "low";
	if (count >= 4 || wastedMs >= 500) return "high";
	if (count >= 3 || wastedMs >= 200) return "medium";
	return "low";
}

const FIX_API =
	"Fetch it once and share the result: move the call up to a common parent, reuse the in-flight promise, or dedupe in the data layer (React Query, SWR or a small cache keyed by URL and body).";
const FIX_STATIC = "Make sure the file is included only once. If it has to load again, give it a long Cache-Control max-age so repeats come straight from cache.";

/**
 * Duplicate calls: the same method, URL and body requested more than once.
 * Preflights, media range requests, cache hits and failed calls are left out:
 * repeats there are expected, free, or already reported elsewhere. When one
 * endpoint has many duplicated URLs, they're reported together.
 */
export const duplicateRule: Rule = ({ entries }) => {
	const groups = new Map<string, Entry[]>();
	for (const entry of entries) {
		if (entry.method === "OPTIONS" || entry.type === "media" || entry.reqHeaders["range"]) continue;
		// Cache hits never reached the network, so repeating them costs nothing.
		if (entry.status === 0 || entry.fromCache) continue;
		const group = groups.get(entry.dedupeKey);
		if (group) group.push(entry);
		else groups.set(entry.dedupeKey, [entry]);
	}

	const byEndpoint = new Map<string, Entry[][]>();
	for (const group of groups.values()) {
		if (group.length < 2) continue;
		const key = group[0]!.endpoint;
		const list = byEndpoint.get(key);
		if (list) list.push(group);
		else byEndpoint.set(key, [group]);
	}

	const findings: Finding[] = [];
	for (const [endpoint, duplicateGroups] of byEndpoint) {
		if (duplicateGroups.length > ROLLUP_AFTER) {
			findings.push(rollup(endpoint, duplicateGroups));
			continue;
		}
		for (const group of duplicateGroups) findings.push(single(group));
	}
	return findings;
};

function single(group: Entry[]): Finding {
	const [first, ...repeats] = group as [Entry, ...Entry[]];
	const wastedMs = sum(repeats.map((entry) => entry.duration));
	const wastedBytes = sum(repeats.map(bytesOf));
	const count = group.length;
	const what = first.requestBody ? "URL and body" : "URL";
	return {
		id: `duplicate:${first.id}`,
		rule: "duplicate",
		severity: severityFor(first, count, wastedMs),
		subject: requestLabel(first),
		title: `ran ${formatCount(count)} times with the same ${what}`,
		why: `${repeats.length === 1 ? "One call" : `${formatCount(repeats.length)} calls`} fetched something the page already had. The repeats took ${formatMs(wastedMs)} and ${formatBytes(wastedBytes)} in total.`,
		fix: STATIC.has(first.type) ? FIX_STATIC : FIX_API,
		requestIds: group.map((entry) => entry.id),
		impact: { ms: wastedMs, bytes: wastedBytes },
		endpoint: first.endpoint,
	};
}

function rollup(endpoint: string, groups: Entry[][]): Finding {
	const first = groups[0]![0]!;
	const repeats = groups.flatMap((group) => group.slice(1));
	const wastedMs = sum(repeats.map((entry) => entry.duration));
	const wastedBytes = sum(repeats.map(bytesOf));
	const worst = maxOf(groups.map((group) => group.length));
	const requestIds = groups.flatMap((group) => group.map((entry) => entry.id)).sort((a, b) => a - b);
	return {
		id: `duplicate:${endpoint}`,
		rule: "duplicate",
		severity: severityFor(first, worst, wastedMs),
		subject: endpointLabel(first),
		title: `repeated ${plural(groups.length, "different request")} (${plural(repeats.length, "extra call")})`,
		why: `${formatCount(groups.length)} distinct URLs on this endpoint were each requested more than once, up to ${worst} times. The ${formatCount(repeats.length)} repeats took ${formatMs(wastedMs)} and ${formatBytes(wastedBytes)} in total.`,
		fix: STATIC.has(first.type) ? FIX_STATIC : FIX_API,
		requestIds,
		impact: { ms: wastedMs, bytes: wastedBytes },
		endpoint,
	};
}
