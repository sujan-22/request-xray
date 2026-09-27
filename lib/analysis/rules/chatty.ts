import { formatCount, formatMs } from "../../format";
import type { Finding, Severity } from "../../model";
import { endpointLabel, maxOf, minOf, type Rule } from "../context";

function severityFor(calls: number, savedMs: number): Severity {
	if (calls >= 20 || savedMs >= 1000) return "high";
	if (calls >= 10 || savedMs >= 300) return "medium";
	return "low";
}

/**
 * Chatty endpoints (the N+1 pattern): one API endpoint called many times with
 * different ids or parameters, where a single batched call would do.
 */
export const chattyRule: Rule = ({ byEndpoint, settings }) => {
	const findings: Finding[] = [];
	for (const [key, group] of byEndpoint) {
		const calls = group.filter((entry) => entry.type === "api" && entry.method !== "OPTIONS");
		if (calls.length < settings.chattyMinCalls) continue;
		const variants = new Set(calls.map((entry) => entry.dedupeKey)).size;
		if (variants < settings.chattyMinCalls) continue;

		const first = calls[0]!;
		const start = minOf(calls.map((entry) => entry.start));
		const end = maxOf(calls.map((entry) => entry.end));
		const slowest = maxOf(calls.map((entry) => entry.duration));
		const wall = end - start;
		const savedMs = Math.max(0, wall - slowest);
		const odata = calls.some((entry) => entry.odata);
		const isGet = first.method === "GET";

		findings.push({
			id: `chatty:${key}`,
			rule: "chatty",
			severity: severityFor(calls.length, savedMs),
			subject: endpointLabel(first),
			title: `was called ${formatCount(calls.length)} times with ${formatCount(variants)} different ${isGet ? "parameters" : "payloads"}`,
			why: `Each call pays for its own round trip, headers and server work. These ${formatCount(calls.length)} calls were spread over ${formatMs(wall)}; one combined call would take roughly as long as the slowest single call (${formatMs(slowest)}).`,
			fix: odata
				? "Fetch them in one request: a single query with $filter=Id in (…) for reads, or group the calls into one OData $batch request."
				: "Add a bulk endpoint that accepts a list of ids, or batch the calls into one request. On the client, collect the ids first and fetch once.",
			requestIds: calls.map((entry) => entry.id),
			impact: { ms: savedMs, bytes: 0 },
			endpoint: key,
		});
	}
	return findings;
};
