import { formatBytes, formatMs } from "../../format";
import type { Entry } from "../../har/entries";
import type { Finding, Severity } from "../../model";
import { maxOf, subjectFor, sum, type Rule } from "../context";

type Phase = "server" | "download" | "queue" | "connection";

/** Which part of the request took the most time, summed across the calls. */
export function dominantPhase(entries: readonly Entry[]): { phase: Phase; ms: number } {
	const totals: Record<Phase, number> = {
		server: sum(entries.map((e) => e.timings.wait)),
		download: sum(entries.map((e) => e.timings.receive)),
		queue: sum(entries.map((e) => e.timings.blocked)),
		connection: sum(entries.map((e) => e.timings.dns + e.timings.connect + e.timings.ssl)),
	};
	const [phase, ms] = (Object.entries(totals) as Array<[Phase, number]>).sort((a, b) => b[1] - a[1])[0]!;
	return { phase, ms: ms / entries.length };
}

const EXPLAIN: Record<Phase, { why: (ms: number, entries: readonly Entry[]) => string; fix: string }> = {
	server: {
		why: (ms) => `Most of the time went to waiting for the server's first byte (about ${formatMs(ms)} per call). The network was fine; the server was slow to answer.`,
		fix: "Look at the server side: slow queries, missing indexes, cold caches or a chain of backend calls. If the data rarely changes, cache the response.",
	},
	download: {
		why: (ms, entries) => `Most of the time went to downloading the response (about ${formatMs(ms)} per call, ${formatBytes(sum(entries.map((e) => e.contentSize)) / entries.length)} each).`,
		fix: "Send less: paginate, return only the fields the page uses, and make sure the response is compressed.",
	},
	queue: {
		why: (ms) => `The request waited in the browser's queue for about ${formatMs(ms)} before it was sent. That usually means too many requests to the same host were already in flight.`,
		fix: "Serve the host over HTTP/2 or HTTP/3, cut the number of parallel requests, or give this request a higher priority (fetchpriority=\"high\" or loading it earlier).",
	},
	connection: {
		why: (ms) => `Setting up the connection (DNS, TCP and TLS) took about ${formatMs(ms)} per call.`,
		fix: "Add <link rel=\"preconnect\"> for this host so the connection is ready early, and keep connections alive so they get reused.",
	},
};

function severityFor(maxMs: number, threshold: number): Severity {
	if (maxMs >= threshold * 3) return "high";
	if (maxMs >= threshold * 1.5) return "medium";
	return "low";
}

/** Slow requests, grouped by endpoint, with the phase that dominated. */
export const slowRule: Rule = ({ byEndpoint, settings }) => {
	const findings: Finding[] = [];
	for (const [key, group] of byEndpoint) {
		const slow = group.filter(
			(entry) =>
				entry.duration >= settings.slowMs &&
				entry.type !== "media" &&
				!/^wss?:/.test(entry.url) &&
				!/text\/event-stream/.test(entry.mimeType),
		);
		if (!slow.length) continue;

		const maxMs = maxOf(slow.map((entry) => entry.duration));
		const avgMs = sum(slow.map((entry) => entry.duration)) / slow.length;
		const { phase, ms } = dominantPhase(slow);
		const explain = EXPLAIN[phase];

		findings.push({
			id: `slow:${key}`,
			rule: "slow",
			severity: severityFor(maxMs, settings.slowMs),
			subject: subjectFor(slow),
			title: slow.length === 1 ? `took ${formatMs(maxMs)}` : `was slow ${slow.length} times (average ${formatMs(avgMs)}, slowest ${formatMs(maxMs)})`,
			why: explain.why(ms, slow),
			fix: explain.fix,
			requestIds: slow.map((entry) => entry.id),
			impact: { ms: sum(slow.map((entry) => entry.duration - settings.slowMs)), bytes: 0 },
			endpoint: key,
		});
	}
	return findings;
};
