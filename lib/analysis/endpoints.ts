import type { Entry } from "../har/entries";
import type { EndpointStat } from "../model";

export function groupByEndpoint(entries: readonly Entry[]): Map<string, Entry[]> {
	const groups = new Map<string, Entry[]>();
	for (const entry of entries) {
		const group = groups.get(entry.endpoint);
		if (group) group.push(entry);
		else groups.set(entry.endpoint, [entry]);
	}
	return groups;
}

/** "GET host/path?keys" → the pattern part after the host. */
export function patternOf(endpoint: string, host: string): string {
	const withoutMethod = endpoint.slice(endpoint.indexOf(" ") + 1);
	return withoutMethod.startsWith(host) ? withoutMethod.slice(host.length) || "/" : withoutMethod;
}

export function buildEndpoints(groups: Map<string, Entry[]>): EndpointStat[] {
	const stats: EndpointStat[] = [];
	for (const [key, calls] of groups) {
		const first = calls[0]!;
		let totalTime = 0;
		let maxTime = 0;
		let totalTransfer = 0;
		let totalContent = 0;
		let errors = 0;
		const variants = new Set<string>();
		for (const call of calls) {
			totalTime += call.duration;
			maxTime = Math.max(maxTime, call.duration);
			totalTransfer += Math.max(0, call.transferSize);
			totalContent += call.contentSize;
			if (call.failed || call.status >= 400) errors++;
			variants.add(call.dedupeKey);
		}
		stats.push({
			key,
			method: first.method,
			host: first.host,
			pattern: patternOf(key, first.host),
			type: first.type,
			calls: calls.length,
			variants: variants.size,
			requestIds: calls.map((call) => call.id),
			totalTime,
			avgTime: totalTime / calls.length,
			maxTime,
			totalTransfer,
			totalContent,
			errors,
			firstStart: first.start,
			odata: calls.some((call) => call.odata),
		});
	}
	return stats.sort((a, b) => b.calls - a.calls || b.totalTime - a.totalTime);
}
