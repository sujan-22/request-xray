import { describe, expect, it } from "vitest";
import { diffKeyed, diffLines, inlineChange, normalizeForDiff, queryMap, toSideBySide } from "./diff";

function apply(ops: ReturnType<typeof diffLines>, side: "a" | "b"): string[] {
	return ops.filter((op) => op.type === "equal" || op.type === (side === "a" ? "delete" : "insert")).map((op) => op.text);
}

describe("diffLines", () => {
	it("returns only equal ops for identical input", () => {
		expect(diffLines(["a", "b"], ["a", "b"]).every((op) => op.type === "equal")).toBe(true);
	});

	it("finds a minimal edit and reconstructs both sides", () => {
		const a = ["{", '  "id": 1,', '  "name": "boot",', '  "price": 90', "}"];
		const b = ["{", '  "id": 1,', '  "name": "boot",', '  "price": 95,', '  "sale": true', "}"];
		const ops = diffLines(a, b);
		expect(apply(ops, "a")).toEqual(a);
		expect(apply(ops, "b")).toEqual(b);
		expect(ops.filter((op) => op.type !== "equal")).toEqual([
			{ type: "delete", text: '  "price": 90' },
			{ type: "insert", text: '  "price": 95,' },
			{ type: "insert", text: '  "sale": true' },
		]);
	});

	it("handles empty sides", () => {
		expect(diffLines([], ["x"])).toEqual([{ type: "insert", text: "x" }]);
		expect(diffLines(["x"], [])).toEqual([{ type: "delete", text: "x" }]);
	});

	it("reconstructs random edits", () => {
		const a = "the quick brown fox jumps over the lazy dog".split(" ");
		const b = "a quick red fox leaps over the dog today".split(" ");
		const ops = diffLines(a, b);
		expect(apply(ops, "a")).toEqual(a);
		expect(apply(ops, "b")).toEqual(b);
	});
});

describe("toSideBySide", () => {
	it("pairs deletes with inserts as changes and numbers lines per side", () => {
		const rows = toSideBySide(diffLines(["a", "b", "c"], ["a", "B", "c", "d"]));
		expect(rows.map((r) => r.kind)).toEqual(["equal", "change", "equal", "insert"]);
		expect(rows[3]).toEqual({ kind: "insert", left: null, right: { line: 4, text: "d" } });
	});
});

describe("inlineChange", () => {
	it("isolates the differing middle", () => {
		expect(inlineChange('"price": 90', '"price": 95,')).toEqual({ prefix: 10, suffixA: 11, suffixB: 12 });
	});
});

describe("diffKeyed", () => {
	it("classifies rows", () => {
		const rows = diffKeyed({ a: "1", b: "2", c: "3" }, { a: "1", b: "20", d: "4" });
		expect(rows).toEqual([
			{ name: "a", a: "1", b: "1", status: "same" },
			{ name: "b", a: "2", b: "20", status: "changed" },
			{ name: "c", a: "3", b: null, status: "removed" },
			{ name: "d", a: null, b: "4", status: "added" },
		]);
	});
});

describe("helpers", () => {
	it("pretty-prints JSON and leaves other text alone", () => {
		expect(normalizeForDiff('{"a":1}')).toBe('{\n  "a": 1\n}');
		expect(normalizeForDiff("a=1&b=2")).toBe("a=1&b=2");
		expect(normalizeForDiff(null)).toBe("");
	});

	it("reads query params, joining repeats", () => {
		expect(queryMap("https://a.test/?x=1&y=2&x=3")).toEqual({ x: "1, 3", y: "2" });
		expect(queryMap("nope")).toEqual({});
	});
});
