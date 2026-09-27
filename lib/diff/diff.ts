/**
 * Diffing for the request comparison view: a Myers line diff for bodies, and a
 * keyed comparison for headers and query parameters.
 */

export type LineOp = { type: "equal" | "delete" | "insert"; text: string };

/** Above this edit distance we stop searching and fall back to a coarse diff. */
const MAX_EDITS = 4000;

/** Myers O(ND) diff on two arrays of lines. */
export function diffLines(a: readonly string[], b: readonly string[]): LineOp[] {
	// Trim the common prefix and suffix first: cheap, and most real diffs are small.
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA--;
		endB--;
	}

	const head: LineOp[] = a.slice(0, start).map((text) => ({ type: "equal", text }));
	const tail: LineOp[] = a.slice(endA).map((text) => ({ type: "equal", text }));
	const midA = a.slice(start, endA);
	const midB = b.slice(start, endB);
	return [...head, ...myers(midA, midB), ...tail];
}

function myers(a: readonly string[], b: readonly string[]): LineOp[] {
	const n = a.length;
	const m = b.length;
	if (n === 0) return b.map((text) => ({ type: "insert", text }));
	if (m === 0) return a.map((text) => ({ type: "delete", text }));

	const max = Math.min(n + m, MAX_EDITS);
	const offset = max;
	const v = new Int32Array(2 * max + 2).fill(-1);
	v[offset + 1] = 0;
	const trace: Int32Array[] = [];

	for (let d = 0; d <= max; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x: number;
			if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) x = v[offset + k + 1]!;
			else x = v[offset + k - 1]! + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) return backtrack(trace, a, b, offset);
		}
	}
	// Too different to diff line by line within budget: show it as replaced.
	return [...a.map((text): LineOp => ({ type: "delete", text })), ...b.map((text): LineOp => ({ type: "insert", text }))];
}

function backtrack(trace: Int32Array[], a: readonly string[], b: readonly string[], offset: number): LineOp[] {
	const ops: LineOp[] = [];
	let x = a.length;
	let y = b.length;
	for (let d = trace.length - 1; d >= 0; d--) {
		const v = trace[d]!;
		const k = x - y;
		const prevK = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? k + 1 : k - 1;
		const prevX = Math.max(0, v[offset + prevK]!);
		const prevY = prevX - prevK;
		while (x > prevX && y > prevY) {
			ops.push({ type: "equal", text: a[x - 1]! });
			x--;
			y--;
		}
		if (d > 0) {
			if (x === prevX) ops.push({ type: "insert", text: b[y - 1]! });
			else ops.push({ type: "delete", text: a[x - 1]! });
		}
		x = prevX;
		y = prevY;
	}
	return ops.reverse();
}

export interface SideCell {
	line: number;
	text: string;
}

export interface SideRow {
	kind: "equal" | "change" | "delete" | "insert";
	left: SideCell | null;
	right: SideCell | null;
}

/** Arrange line ops into side-by-side rows, pairing deletes with the inserts that follow them. */
export function toSideBySide(ops: readonly LineOp[]): SideRow[] {
	const rows: SideRow[] = [];
	let leftLine = 1;
	let rightLine = 1;
	let i = 0;
	while (i < ops.length) {
		const op = ops[i]!;
		if (op.type === "equal") {
			rows.push({ kind: "equal", left: { line: leftLine++, text: op.text }, right: { line: rightLine++, text: op.text } });
			i++;
			continue;
		}
		const deletes: string[] = [];
		const inserts: string[] = [];
		while (i < ops.length && ops[i]!.type === "delete") deletes.push(ops[i++]!.text);
		while (i < ops.length && ops[i]!.type === "insert") inserts.push(ops[i++]!.text);
		const count = Math.max(deletes.length, inserts.length);
		for (let j = 0; j < count; j++) {
			const left = j < deletes.length ? { line: leftLine++, text: deletes[j]! } : null;
			const right = j < inserts.length ? { line: rightLine++, text: inserts[j]! } : null;
			rows.push({ kind: left && right ? "change" : left ? "delete" : "insert", left, right });
		}
	}
	return rows;
}

/** Split two changed lines into shared prefix, differing middle and shared suffix, for inline highlighting. */
export function inlineChange(a: string, b: string): { prefix: number; suffixA: number; suffixB: number } {
	let prefix = 0;
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
	let suffix = 0;
	while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
	return { prefix, suffixA: a.length - suffix, suffixB: b.length - suffix };
}

export interface KeyedRow {
	name: string;
	a: string | null;
	b: string | null;
	status: "same" | "changed" | "added" | "removed";
}

/** Compare two name → value maps (headers, query params). Rows keep A's order, then B's additions. */
export function diffKeyed(a: Record<string, string>, b: Record<string, string>): KeyedRow[] {
	const rows: KeyedRow[] = [];
	for (const [name, value] of Object.entries(a)) {
		const other = b[name];
		if (other === undefined) rows.push({ name, a: value, b: null, status: "removed" });
		else rows.push({ name, a: value, b: other, status: other === value ? "same" : "changed" });
	}
	for (const [name, value] of Object.entries(b)) {
		if (!(name in a)) rows.push({ name, a: null, b: value, status: "added" });
	}
	return rows;
}

/** Pretty-print JSON so structural diffs line up; anything else is returned as-is. */
export function normalizeForDiff(text: string | null): string {
	if (!text) return "";
	const trimmed = text.trim();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return JSON.stringify(JSON.parse(trimmed), null, 2);
		} catch {
			// not JSON after all
		}
	}
	return text;
}

export function queryMap(url: string): Record<string, string> {
	const map: Record<string, string> = {};
	try {
		for (const [key, value] of new URL(url).searchParams) map[key] = key in map ? `${map[key]}, ${value}` : value;
	} catch {
		// invalid URL: no params
	}
	return map;
}
