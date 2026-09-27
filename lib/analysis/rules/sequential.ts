import { formatMs } from "../../format";
import type { Entry } from "../../har/entries";
import type { Finding, Severity } from "../../model";
import { maxOf, type Rule, type RuleContext } from "../context";

/** HAR timestamps are millisecond precision; allow for rounding at the seams. */
const TOLERANCE_MS = 2;
/** Chains that would save less than this are not worth a finding. */
const MIN_SAVING_MS = 100;
/** Long sessions can hold hundreds of chains; report the ones that cost the most. */
export const MAX_CHAINS = 25;

function severityFor(savedMs: number): Severity {
	if (savedMs >= 1000) return "high";
	if (savedMs >= 300) return "medium";
	return "low";
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value.replace(/\+/g, " "));
	} catch {
		return value;
	}
}

/** Id-like tokens (4+ chars containing a digit) from a request's URL and body. */
export function idTokens(entry: Entry): Set<string> {
	const tokens = new Set<string>();
	const add = (text: string) => {
		for (const token of text.split(/[^A-Za-z0-9\-_.@]+/)) {
			if (token.length >= 4 && /\d/.test(token)) tokens.add(token);
		}
	};
	add(safeDecode(entry.path));
	add(safeDecode(entry.search.replace(/^\?/, "")));
	if (entry.requestBody) add(entry.requestBody.slice(0, 50_000));
	return tokens;
}

export type Dependency = "depends" | "independent" | "unknown";

/**
 * Does `later` use a value that first appeared in `earlier`'s response? A token
 * that `earlier` itself sent doesn't count: both calls got it from somewhere else.
 */
export function dependency(later: Entry, earlier: Entry, ctx: RuleContext, tokens: (entry: Entry) => Set<string>): Dependency {
	const body = ctx.body(earlier);
	if (body === null) return "unknown";
	const earlierTokens = tokens(earlier);
	for (const token of tokens(later)) {
		if (earlierTokens.has(token)) continue;
		if (body.includes(token)) return "depends";
	}
	return "independent";
}

function shortName(entry: Entry): string {
	const name = entry.name.replace(/\(([^()]+)\)/g, "(…)");
	return name.length > 28 ? `${name.slice(0, 27)}…` : name;
}

/**
 * Sequential chains: API calls where each one started only after the previous
 * one finished. Builds a graph of "B started within chainGapMs of A ending",
 * drops links where B needs data from A's response, and reports the longest
 * remaining chains.
 */
export const sequentialRule: Rule = (ctx) => {
	const { settings } = ctx;
	const calls = ctx.entries.filter(
		(entry) => entry.type === "api" && entry.method !== "OPTIONS" && !entry.fromCache && entry.duration > 0 && entry.status !== 0,
	);
	const n = calls.length;
	if (n < settings.chainMinLength) return [];

	const tokenCache = new Map<number, Set<string>>();
	const tokens = (entry: Entry) => {
		let cached = tokenCache.get(entry.id);
		if (!cached) {
			cached = idTokens(entry);
			tokenCache.set(entry.id, cached);
		}
		return cached;
	};

	let maxDuration = 0;
	for (const call of calls) maxDuration = Math.max(maxDuration, call.duration);

	const length = new Array<number>(n).fill(1);
	const prev = new Array<number>(n).fill(-1);
	const checked = new Array<boolean>(n).fill(true);

	for (let j = 0; j < n; j++) {
		const later = calls[j]!;
		const earliest = later.start - settings.chainGapMs - maxDuration;
		for (let i = j - 1; i >= 0; i--) {
			const earlier = calls[i]!;
			if (earlier.start < earliest) break;
			const gap = later.start - earlier.end;
			if (gap < -TOLERANCE_MS || gap > settings.chainGapMs) continue;
			// Waves of calls to one endpoint line up end-to-start by chance; that's the chatty rule's job.
			if (later.endpoint === earlier.endpoint) continue;

			const candidate = length[i]! + 1;
			const current = prev[j]! >= 0 ? calls[prev[j]!]! : null;
			const better = candidate > length[j]! || (candidate === length[j]! && current !== null && earlier.end > current.end);
			if (!better) continue;

			const dep = dependency(later, earlier, ctx, tokens);
			if (dep === "depends") continue;
			length[j] = candidate;
			prev[j] = i;
			checked[j] = dep === "independent";
		}
	}

	const order = [...length.keys()].sort((a, b) => length[b]! - length[a]! || calls[a]!.start - calls[b]!.start);
	const used = new Set<number>();
	const findings: Finding[] = [];

	for (const tail of order) {
		if (length[tail]! < settings.chainMinLength) break;
		if (used.has(tail)) continue;

		const indexes: number[] = [];
		for (let k = tail; k !== -1 && !used.has(k); k = prev[k]!) indexes.push(k);
		indexes.reverse();
		if (indexes.length < settings.chainMinLength) continue;

		const chain = indexes.map((k) => calls[k]!);
		const wall = chain[chain.length - 1]!.end - chain[0]!.start;
		const slowest = maxOf(chain.map((entry) => entry.duration));
		const widestGap = maxOf(chain.slice(1).map((entry, i) => Math.max(0, entry.start - chain[i]!.end)));
		const savedMs = wall - slowest;
		if (savedMs < MIN_SAVING_MS) continue;
		for (const k of indexes) used.add(k);

		// Every link after the first was checked against the previous response.
		const verified = indexes.slice(1).every((k) => checked[k]);
		const odata = chain.some((entry) => entry.odata);
		const dependencyNote = verified
			? " None of these calls uses an id from the previous call's response, so they look independent."
			: " Some response bodies weren't recorded, so Request X-ray couldn't check whether each call needs the previous one's data.";

		findings.push({
			id: `sequential:${chain[0]!.id}`,
			rule: "sequential",
			severity: severityFor(savedMs),
			subject: chain.map(shortName).join(" → "),
			title: `ran one after another (${chain.length} calls)`,
			why: `Each call started within ${formatMs(widestGap)} of the previous one finishing, so their times add up to ${formatMs(wall)}. Run together they would take about ${formatMs(slowest)}, the time of the slowest call.${dependencyNote}`,
			fix: `If the calls don't need each other's results, start them together (Promise.all) or combine them into one round trip${odata ? " with an OData $batch request" : ""}. If they do depend on each other, one server endpoint that does the whole sequence saves the extra round trips.`,
			requestIds: chain.map((entry) => entry.id),
			chain: chain.map((entry) => entry.id),
			impact: { ms: savedMs, bytes: 0 },
		});
	}
	return findings.sort((a, b) => b.impact.ms - a.impact.ms).slice(0, MAX_CHAINS);
};
