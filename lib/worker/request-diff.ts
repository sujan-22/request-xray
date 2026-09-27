import { diffKeyed, diffLines, normalizeForDiff, queryMap, toSideBySide, type KeyedRow, type SideRow } from "../diff/diff";
import { requestText, responseText } from "../har/body";
import type { Entry } from "../har/entries";

/** Bodies longer than this many lines are diffed as a whole block instead of line by line. */
const MAX_DIFF_LINES = 20_000;

export interface BodyDiff {
	rows: SideRow[];
	changed: number;
	identical: boolean;
	/** One or both sides missing. */
	missing: "a" | "b" | "both" | null;
	tooLarge: boolean;
}

export interface RequestDiff {
	a: number;
	b: number;
	query: KeyedRow[];
	requestHeaders: KeyedRow[];
	responseHeaders: KeyedRow[];
	requestBody: BodyDiff;
	responseBody: BodyDiff;
}

function headerRecord(entry: Entry, which: "req" | "res"): Record<string, string> {
	return which === "req" ? entry.reqHeaders : entry.resHeaders;
}

export function diffBodies(a: string | null, b: string | null): BodyDiff {
	if (a === null && b === null) return { rows: [], changed: 0, identical: true, missing: "both", tooLarge: false };
	const left = normalizeForDiff(a).split("\n");
	const right = normalizeForDiff(b).split("\n");
	const missing = a === null ? "a" : b === null ? "b" : null;
	if (left.length > MAX_DIFF_LINES || right.length > MAX_DIFF_LINES) {
		const identical = a === b;
		return { rows: [], changed: identical ? 0 : 1, identical, missing, tooLarge: true };
	}
	const rows = toSideBySide(diffLines(a === null ? [] : left, b === null ? [] : right));
	const changed = rows.filter((row) => row.kind !== "equal").length;
	return { rows, changed, identical: changed === 0, missing, tooLarge: false };
}

export function buildRequestDiff(a: Entry, b: Entry): RequestDiff {
	return {
		a: a.id,
		b: b.id,
		query: diffKeyed(queryMap(a.url), queryMap(b.url)),
		requestHeaders: diffKeyed(headerRecord(a, "req"), headerRecord(b, "req")),
		responseHeaders: diffKeyed(headerRecord(a, "res"), headerRecord(b, "res")),
		requestBody: diffBodies(requestText(a.raw), requestText(b.raw)),
		responseBody: diffBodies(responseText(a.raw), responseText(b.raw)),
	};
}
