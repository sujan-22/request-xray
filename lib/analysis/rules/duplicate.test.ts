import { describe, expect, it } from "vitest";
import { api } from "../../testing/har-builder";
import { runRule } from "../../testing/run-rule";
import { duplicateRule } from "./duplicate";

const CART = "https://api.shop.test/Commerce/Carts('c-42')?api-version=7.3";

describe("duplicate rule", () => {
	it("flags the same GET made several times, with the wasted time and bytes", () => {
		const findings = runRule(duplicateRule, [
			api(CART, 0, 200, { transfer: 1000 }),
			api(CART, 300, 150, { transfer: 1000 }),
			api(CART, 500, 250, { transfer: 1000 }),
			api(CART, 900, 100, { transfer: 1000 }),
		]);
		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding!.rule).toBe("duplicate");
		expect(finding!.requestIds).toEqual([0, 1, 2, 3]);
		expect(finding!.impact).toEqual({ ms: 500, bytes: 3000 });
		expect(finding!.severity).toBe("high");
		expect(finding!.title).toBe("ran 4 times with the same URL");
		expect(finding!.subject).toBe("GET /Commerce/Carts('c-42')?api-version=7.3");
	});

	it("treats the same URL with a different body as different calls", () => {
		const findings = runRule(duplicateRule, [
			api("https://api.test/search", 0, 100, { method: "POST", body: '{"q":"shoes"}' }),
			api("https://api.test/search", 200, 100, { method: "POST", body: '{"q":"hats"}' }),
		]);
		expect(findings).toHaveLength(0);
	});

	it("mentions the body when POST bodies match", () => {
		const findings = runRule(duplicateRule, [
			api("https://api.test/search", 0, 100, { method: "POST", body: '{"q":"shoes"}' }),
			api("https://api.test/search", 200, 100, { method: "POST", body: '{"q":"shoes"}' }),
		]);
		expect(findings[0]!.title).toBe("ran 2 times with the same URL and body");
		expect(findings[0]!.severity).toBe("low");
	});

	it("ignores preflights, range requests and failed calls", () => {
		const findings = runRule(duplicateRule, [
			api("https://api.test/a", 0, 50, { method: "OPTIONS" }),
			api("https://api.test/a", 100, 50, { method: "OPTIONS" }),
			{ url: "https://cdn.test/video.mp4", start: 0, reqHeaders: { range: "bytes=0-" }, type: "media" },
			{ url: "https://cdn.test/video.mp4", start: 10, reqHeaders: { range: "bytes=100-" }, type: "media" },
			api("https://api.test/b", 0, 50, { status: 0 }),
			api("https://api.test/b", 100, 50, { status: 0 }),
		]);
		expect(findings).toHaveLength(0);
	});

	it("keeps duplicated static files at a lower severity", () => {
		const script = { url: "https://cdn.test/app.js", type: "script", mime: "application/javascript" };
		const findings = runRule(duplicateRule, [
			{ ...script, start: 0, duration: 400 },
			{ ...script, start: 500, duration: 400 },
			{ ...script, start: 1000, duration: 400 },
		]);
		expect(findings[0]!.severity).toBe("low");
		expect(findings[0]!.fix).toMatch(/included only once/);
	});

	it("rolls many duplicated URLs on one endpoint into a single finding", () => {
		const specs = Array.from({ length: 5 }, (_, i) => [api(`https://api.test/items/${i}`, i * 100, 50), api(`https://api.test/items/${i}`, i * 100 + 60, 50)]).flat();
		const findings = runRule(duplicateRule, specs);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.subject).toBe("GET /items/{n}");
		expect(findings[0]!.title).toBe("repeated 5 different requests (5 extra calls)");
		expect(findings[0]!.requestIds).toHaveLength(10);
		expect(findings[0]!.impact.ms).toBe(250);
	});

	it("keeps a few duplicated URLs on one endpoint as separate findings", () => {
		const specs = Array.from({ length: 3 }, (_, i) => [api(`https://api.test/items/${i}`, i * 100, 50), api(`https://api.test/items/${i}`, i * 100 + 60, 50)]).flat();
		expect(runRule(duplicateRule, specs)).toHaveLength(3);
	});

	it("ignores repeats served from the browser cache", () => {
		const findings = runRule(duplicateRule, [api(CART, 0, 100), api(CART, 200, 1, { fromCache: "memory" })]);
		expect(findings).toHaveLength(0);
	});
});
