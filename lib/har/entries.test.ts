import { describe, expect, it } from "vitest";
import { BASE_TIME, makeEntry, makeHar } from "../testing/har-builder";
import { buildEntries, toRecord } from "./entries";

describe("buildEntries", () => {
	it("sorts by start time and measures from the first request", () => {
		const har = makeHar([
			{ url: "https://a.test/second", start: 250 },
			{ url: "https://a.test/first", start: 100 },
		]);
		const { entries } = buildEntries(har);
		expect(entries.map((e) => e.name)).toEqual(["first", "second"]);
		expect(entries[0]!.start).toBe(0);
		expect(entries[1]!.start).toBe(150);
		expect(entries.map((e) => e.id)).toEqual([0, 1]);
	});

	it("normalizes timings: -1 becomes 0 and TLS is split out of connect", () => {
		const har = makeHar([
			{ url: "https://a.test/", duration: 300, timings: { blocked: -1, dns: 10, connect: 50, ssl: 30, send: 1, wait: 150, receive: 89 } },
		]);
		const [entry] = buildEntries(har).entries;
		expect(entry!.timings).toEqual({ blocked: 0, dns: 10, connect: 20, ssl: 30, send: 1, wait: 150, receive: 89 });
		expect(entry!.duration).toBe(300);
		expect(entry!.end).toBe(300);
	});

	it("falls back to the sum of phases when time is missing", () => {
		const raw = makeEntry({ url: "https://a.test/", timings: { wait: 40, receive: 10 } });
		delete raw.time;
		const { entries } = buildEntries({ log: { entries: [raw] } });
		expect(entries[0]!.duration).toBe(50);
	});

	it("prefers Chrome's _transferSize and falls back to body + headers", () => {
		const chrome = makeEntry({ url: "https://a.test/a", transfer: 1234, size: 5000 });
		const plain = makeEntry({ url: "https://a.test/b", size: 5000 });
		plain.response!.bodySize = 900;
		plain.response!.headersSize = 100;
		const unknown = makeEntry({ url: "https://a.test/c" });
		unknown.response!.bodySize = -1;
		const { entries } = buildEntries({ log: { entries: [chrome, plain, unknown] } });
		expect(entries.map((e) => e.transferSize)).toEqual([1234, 1000, -1]);
	});

	it("skips entries without a usable URL and ignores data: URLs, with warnings", () => {
		const har = makeHar([{ url: "https://a.test/ok" }, { url: "not a url" }, { url: "data:image/png;base64,AAAA" }]);
		har.log.entries!.push({} as never);
		const result = buildEntries(har);
		expect(result.entries).toHaveLength(1);
		expect(result.skipped).toBe(2);
		expect(result.warnings.join(" ")).toMatch(/Skipped 2 entries/);
		expect(result.warnings.join(" ")).toMatch(/data: or blob:/);
	});

	it("infers resource types when Chrome's _resourceType is missing", () => {
		const har = makeHar([
			{ url: "https://a.test/", mime: "text/html" },
			{ url: "https://a.test/app.js", mime: "application/javascript" },
			{ url: "https://a.test/site.css", mime: "text/css" },
			{ url: "https://a.test/logo", mime: "image/png" },
			{ url: "https://a.test/f.woff2", mime: "application/octet-stream" },
			{ url: "https://a.test/api/cart", mime: "application/json" },
			{ url: "https://a.test/x", mime: "", reqHeaders: { "sec-fetch-dest": "empty" } },
		]);
		const types = buildEntries(har).entries.map((e) => e.type);
		expect(types).toEqual(["document", "script", "style", "image", "font", "api", "api"]);
	});

	it("maps Chrome resource types", () => {
		const har = makeHar([
			{ url: "https://a.test/1", type: "xhr" },
			{ url: "https://a.test/2", type: "fetch" },
			{ url: "https://a.test/3", type: "stylesheet" },
			{ url: "https://a.test/4", type: "websocket" },
		]);
		expect(buildEntries(har).entries.map((e) => e.type)).toEqual(["api", "api", "style", "other"]);
	});

	it("finds the primary host from the first document and marks first-party hosts", () => {
		const har = makeHar([
			{ url: "https://cdn.analytics.test/a.js", start: 0, type: "script" },
			{ url: "https://www.shop.test/", start: 5, type: "document" },
			{ url: "https://api.shop.test/cart", start: 10, type: "fetch" },
		]);
		const result = buildEntries(har);
		expect(result.primaryHost).toBe("www.shop.test");
		expect(result.entries.map((e) => e.firstParty)).toEqual([false, true, true]);
	});

	it("detects OData requests from query options and headers", () => {
		const har = makeHar([
			{ url: "https://a.test/odata/Products?$filter=Price gt 5&$top=10" },
			{ url: "https://a.test/odata/Products(1)", resHeaders: { "odata-version": "4.0" } },
			{ url: "https://a.test/odata/$batch", method: "POST" },
			{ url: "https://a.test/api/products?filter=x" },
		]);
		expect(buildEntries(har).entries.map((e) => e.odata)).toEqual([true, true, true, false]);
	});

	it("marks failed requests and reads the content-encoding", () => {
		const har = makeHar([
			{ url: "https://a.test/a", status: 0, error: "net::ERR_BLOCKED_BY_CLIENT" },
			{ url: "https://a.test/b", resHeaders: { "Content-Encoding": "GZIP" } },
		]);
		const [failed, ok] = buildEntries(har).entries;
		expect(failed!.failed).toBe(true);
		expect(failed!.error).toBe("net::ERR_BLOCKED_BY_CLIENT");
		expect(ok!.encoding).toBe("gzip");
	});

	it("places page timing markers on the shared axis", () => {
		const har = makeHar([{ url: "https://a.test/", start: 20, pageref: "page_1" }], [
			{ id: "page_1", title: "Home", startedDateTime: new Date(BASE_TIME).toISOString(), pageTimings: { onContentLoad: 400, onLoad: 900 } },
		]);
		const { pages, entries } = buildEntries(har);
		expect(pages[0]).toEqual({ id: "page_1", title: "Home", start: 0, onContentLoad: 400, onLoad: 900 });
		expect(entries[0]!.start).toBe(20);
	});

	it("builds the same dedupe key for identical calls and a different one when the body changes", () => {
		const har = makeHar([
			{ url: "https://a.test/api", method: "POST", body: '{"a":1}' },
			{ url: "https://a.test/api", method: "POST", body: '{"a":1}' },
			{ url: "https://a.test/api", method: "POST", body: '{"a":2}' },
		]);
		const [a, b, c] = buildEntries(har).entries;
		expect(a!.dedupeKey).toBe(b!.dedupeKey);
		expect(a!.dedupeKey).not.toBe(c!.dedupeKey);
	});

	it("toRecord drops worker-only fields", () => {
		const [entry] = buildEntries(makeHar([{ url: "https://a.test/" }])).entries;
		const record = toRecord(entry!);
		expect(record).not.toHaveProperty("raw");
		expect(record).not.toHaveProperty("reqHeaders");
		expect(record).not.toHaveProperty("requestBody");
		expect(record.url).toBe("https://a.test/");
	});
});
