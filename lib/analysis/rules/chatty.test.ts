import { describe, expect, it } from "vitest";
import { api } from "../../testing/har-builder";
import { runRule } from "../../testing/run-rule";
import { chattyRule } from "./chatty";

const product = (key: number, start: number, duration = 120) =>
	api(`https://api.shop.test/Commerce/Products(${key})?api-version=7.3`, start, duration, {
		resHeaders: { "odata-version": "4.0", "content-encoding": "gzip" },
	});

describe("chatty rule", () => {
	it("flags one endpoint called with many different keys (N+1)", () => {
		const specs = Array.from({ length: 12 }, (_, i) => product(1000 + i, i * 50));
		const findings = runRule(chattyRule, specs);
		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding!.subject).toBe("GET /Commerce/Products({key})?api-version");
		expect(finding!.title).toBe("was called 12 times with 12 different parameters");
		expect(finding!.requestIds).toHaveLength(12);
		// Wall time 11 × 50 + 120 = 670; slowest single call 120.
		expect(finding!.impact.ms).toBe(550);
		expect(finding!.severity).toBe("medium");
		expect(finding!.fix).toMatch(/\$batch/);
	});

	it("stays quiet below the threshold", () => {
		const specs = Array.from({ length: 4 }, (_, i) => product(i, i * 50));
		expect(runRule(chattyRule, specs)).toHaveLength(0);
	});

	it("honours a custom threshold", () => {
		const specs = Array.from({ length: 4 }, (_, i) => product(i, i * 50));
		expect(runRule(chattyRule, specs, { chattyMinCalls: 3 })).toHaveLength(1);
	});

	it("does not treat pure duplicates as chatty", () => {
		const specs = Array.from({ length: 8 }, (_, i) => product(7, i * 50));
		expect(runRule(chattyRule, specs)).toHaveLength(0);
	});

	it("only looks at API calls", () => {
		const specs = Array.from({ length: 8 }, (_, i) => ({ url: `https://cdn.test/img/${i}.png`, type: "image", start: i }));
		expect(runRule(chattyRule, specs)).toHaveLength(0);
	});

	it("suggests a bulk endpoint for non-OData APIs", () => {
		const specs = Array.from({ length: 6 }, (_, i) => api(`https://api.test/users/${i}`, i * 10, 50));
		const [finding] = runRule(chattyRule, specs);
		expect(finding!.fix).toMatch(/bulk endpoint/);
		expect(finding!.fix).not.toMatch(/\$batch/);
	});
});
