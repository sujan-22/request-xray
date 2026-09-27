import { describe, expect, it } from "vitest";
import { buildEntries, toRecord } from "./har/entries";
import { isEmptySearch, matchSearch, parseSearch } from "./search";
import { api, makeHar } from "./testing/har-builder";

const records = buildEntries(
	makeHar([
		api("https://api.shop.test/checkout", 0, 1200, { method: "POST", status: 500, size: 2_000 }),
		api("https://api.shop.test/cart", 0, 90, { size: 300_000 }),
		{ url: "https://cdn.shop.test/app.js", type: "script", duration: 40 },
		{ url: "https://analytics.test/collect", type: "ping", status: 0, error: "net::ERR_BLOCKED_BY_CLIENT" },
	]),
).entries.map(toRecord);

function names(query: string): string[] {
	const search = parseSearch(query);
	return records.filter((r) => matchSearch(r, search)).map((r) => r.name);
}

describe("search", () => {
	it("matches free text and exclusions", () => {
		expect(names("shop")).toEqual(["checkout", "cart", "app.js"]);
		expect(names("shop -cdn")).toEqual(["checkout", "cart"]);
	});

	it("filters by method, status, type and host", () => {
		expect(names("method:post")).toEqual(["checkout"]);
		expect(names("status:5xx")).toEqual(["checkout"]);
		expect(names("status:failed")).toEqual(["checkout", "collect"]);
		expect(names("type:script")).toEqual(["app.js"]);
		expect(names("host:cdn,analytics")).toEqual(["app.js", "collect"]);
	});

	it("filters by size and time", () => {
		expect(names("larger:100kb")).toEqual(["cart"]);
		expect(names("slower:1s")).toEqual(["checkout"]);
	});

	it("combines terms with AND", () => {
		expect(names("type:api status:200")).toEqual(["cart"]);
	});

	it("knows when it is empty", () => {
		expect(isEmptySearch(parseSearch("  "))).toBe(true);
		expect(isEmptySearch(parseSearch("x"))).toBe(false);
	});
});
