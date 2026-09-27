import { describe, expect, it } from "vitest";
import { buildEntries } from "../../har/entries";
import { makeEntry } from "../../testing/har-builder";
import { runRule } from "../../testing/run-rule";
import { isCompressed, noCompressionRule } from "./no-compression";

describe("no compression rule", () => {
	it("flags text responses without Content-Encoding, grouped by host", () => {
		const findings = runRule(noCompressionRule, [
			{ url: "https://api.test/a", type: "fetch", size: 200_000 },
			{ url: "https://api.test/b", type: "fetch", size: 100_000 },
			{ url: "https://cdn.test/app.js", type: "script", mime: "text/javascript", size: 50_000 },
		]);
		expect(findings).toHaveLength(2);
		const api = findings.find((f) => f.subject === "api.test")!;
		expect(api.requestIds).toEqual([0, 1]);
		expect(api.impact.bytes).toBe(210_000);
		expect(api.severity).toBe("medium");
		expect(api.title).toBe("sent 2 text responses without compression (300 kB)");
	});

	it("ignores compressed, binary, tiny and non-200 responses", () => {
		const findings = runRule(noCompressionRule, [
			{ url: "https://a.test/gz", size: 50_000, resHeaders: { "content-encoding": "gzip" } },
			{ url: "https://a.test/img.png", type: "image", mime: "image/png", size: 50_000 },
			{ url: "https://a.test/tiny", size: 300 },
			{ url: "https://a.test/304", size: 50_000, status: 304 },
			{ url: "https://a.test/500", size: 50_000, status: 500 },
		]);
		expect(findings).toHaveLength(0);
	});

	it("treats identity encoding as uncompressed", () => {
		const findings = runRule(noCompressionRule, [{ url: "https://a.test/x", size: 5000, resHeaders: { "content-encoding": "identity" } }]);
		expect(findings).toHaveLength(1);
	});

	it("infers compression from wire size when headers are missing", () => {
		const raw = makeEntry({ url: "https://a.test/x", size: 10_000 });
		raw.response!.bodySize = 2_000;
		const [entry] = buildEntries({ log: { entries: [raw] } }).entries;
		expect(isCompressed(entry!)).toBe(true);
	});

	it("reads HAR's content.compression field", () => {
		const raw = makeEntry({ url: "https://a.test/x", size: 10_000 });
		raw.response!.content!.compression = 7_000;
		const [entry] = buildEntries({ log: { entries: [raw] } }).entries;
		expect(isCompressed(entry!)).toBe(true);
	});
});
