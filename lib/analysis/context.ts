import { responseText } from "../har/body";
import type { Entry } from "../har/entries";
import type { Finding, Settings } from "../model";

export interface RuleContext {
	entries: readonly Entry[];
	/** Entries grouped by endpoint key, in start order. */
	byEndpoint: ReadonlyMap<string, Entry[]>;
	settings: Settings;
	/** Response body text, decoded once and cached. */
	body(entry: Entry): string | null;
}

export type Rule = (ctx: RuleContext) => Finding[];

export function createContext(entries: readonly Entry[], byEndpoint: ReadonlyMap<string, Entry[]>, settings: Settings): RuleContext {
	const cache = new Map<number, string | null>();
	return {
		entries,
		byEndpoint,
		settings,
		body(entry) {
			if (!cache.has(entry.id)) cache.set(entry.id, responseText(entry.raw));
			return cache.get(entry.id) ?? null;
		},
	};
}

/** "GET /api/products/{n}" from an endpoint key, without the host. */
export function endpointLabel(entry: Entry): string {
	const afterMethod = entry.endpoint.slice(entry.method.length + 1);
	const path = afterMethod.startsWith(entry.host) ? afterMethod.slice(entry.host.length) : afterMethod;
	return `${entry.method} ${path || "/"}`;
}

/** "GET /api/products/42?x=1" for one concrete request, without the host. */
export function requestLabel(entry: Entry): string {
	let search = entry.search;
	try {
		search = decodeURIComponent(search);
	} catch {
		// keep it encoded
	}
	return `${entry.method} ${entry.path}${search}`;
}

/** A concrete request label for one call, the endpoint pattern for several. */
export function subjectFor(entries: readonly Entry[]): string {
	return entries.length === 1 ? requestLabel(entries[0]!) : endpointLabel(entries[0]!);
}

export function sum(values: Iterable<number>): number {
	let total = 0;
	for (const value of values) total += value;
	return total;
}

/** Math.max/min without spreading, which overflows the stack on very large arrays. */
export function maxOf(values: readonly number[]): number {
	let max = -Infinity;
	for (const value of values) if (value > max) max = value;
	return max;
}

export function minOf(values: readonly number[]): number {
	let min = Infinity;
	for (const value of values) if (value < min) min = value;
	return min;
}

export function bytesOf(entry: Entry): number {
	return entry.transferSize >= 0 ? entry.transferSize : entry.contentSize;
}
