import { describe, expect, it } from "vitest";
import { api } from "../../testing/har-builder";
import { runRule } from "../../testing/run-rule";
import { MAX_CHAINS, sequentialRule } from "./sequential";

describe("sequential rule", () => {
	it("finds calls that each start right after the previous one ends", () => {
		const findings = runRule(sequentialRule, [
			api("https://api.test/customer", 0, 200, { response: '{"name":"Ada"}' }),
			api("https://api.test/settings", 210, 300, { response: '{"theme":"dark"}' }),
			api("https://api.test/promotions", 520, 250, { response: "[]" }),
		]);
		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding!.chain).toEqual([0, 1, 2]);
		expect(finding!.subject).toBe("customer → settings → promotions");
		// Wall: 0 → 770. Slowest: 300. Saving: 470.
		expect(finding!.impact.ms).toBe(470);
		expect(finding!.severity).toBe("medium");
		expect(finding!.why).toMatch(/look independent/);
		expect(finding!.why).toMatch(/^Each call started within 10 ms/);
	});

	it("ignores calls that overlap (already parallel)", () => {
		const findings = runRule(sequentialRule, [
			api("https://api.test/a", 0, 300),
			api("https://api.test/b", 50, 300),
			api("https://api.test/c", 100, 300),
		]);
		expect(findings).toHaveLength(0);
	});

	it("respects the gap setting", () => {
		const specs = [api("https://api.test/a", 0, 200), api("https://api.test/b", 280, 200), api("https://api.test/c", 560, 200)];
		expect(runRule(sequentialRule, specs)).toHaveLength(0);
		expect(runRule(sequentialRule, specs, { chainGapMs: 100 })).toHaveLength(1);
	});

	it("respects the minimum chain length", () => {
		const specs = [api("https://api.test/a", 0, 300), api("https://api.test/b", 310, 300)];
		expect(runRule(sequentialRule, specs)).toHaveLength(0);
		expect(runRule(sequentialRule, specs, { chainMinLength: 2 })).toHaveLength(1);
	});

	it("breaks the chain where a call uses an id from the previous response", () => {
		const findings = runRule(sequentialRule, [
			api("https://api.test/customer", 0, 200, { response: '{"cartId":"cart-88412"}' }),
			api("https://api.test/carts/cart-88412", 210, 200, { response: '{"lines":[]}' }),
			api("https://api.test/recommendations", 420, 200, { response: "[]" }),
		]);
		// customer → cart is a real dependency, leaving cart → recommendations (too short).
		expect(findings).toHaveLength(0);
	});

	it("doesn't count ids the earlier call also sent", () => {
		const findings = runRule(sequentialRule, [
			api("https://api.test/catalog?channel=5637144592", 0, 200, { response: '{"channel":5637144592}' }),
			api("https://api.test/menu?channel=5637144592", 210, 200, { response: "{}" }),
			api("https://api.test/banners?channel=5637144592", 420, 200, { response: "{}" }),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.chain).toEqual([0, 1, 2]);
	});

	it("says so when response bodies are missing", () => {
		const findings = runRule(sequentialRule, [
			api("https://api.test/a", 0, 200),
			api("https://api.test/b", 205, 200),
			api("https://api.test/c", 410, 200),
		]);
		for (const spec of findings) expect(spec.why).toMatch(/couldn't check/);
	});

	it("skips chains that would save too little", () => {
		const findings = runRule(sequentialRule, [
			api("https://api.test/a", 0, 20, { response: "{}" }),
			api("https://api.test/b", 25, 20, { response: "{}" }),
			api("https://api.test/c", 50, 20, { response: "{}" }),
		]);
		expect(findings).toHaveLength(0);
	});

	it("ignores staggered waves of calls to the same endpoint", () => {
		// Tiles fire every 35 ms and each call takes ~220 ms, so call i ends just before call i+7 starts.
		const specs = Array.from({ length: 20 }, (_, i) => api(`https://api.test/products/${1000 + i}`, i * 35, 220, { response: "{}" }));
		expect(runRule(sequentialRule, specs)).toHaveLength(0);
	});

	it("reports at most MAX_CHAINS chains, the costliest first", () => {
		// 40 separate three-call chains, each on its own endpoints and a second apart.
		const specs = Array.from({ length: 40 }, (_, c) =>
			[0, 1, 2].map((step) => api(`https://api.test/c${c}/step${step}`, c * 5000 + step * (210 + c), 200 + c, { response: "{}" })),
		).flat();
		const findings = runRule(sequentialRule, specs);
		expect(findings).toHaveLength(MAX_CHAINS);
		expect(findings[0]!.impact.ms).toBeGreaterThan(findings[MAX_CHAINS - 1]!.impact.ms);
	});

	it("picks the longest chain and doesn't reuse its calls", () => {
		const body = { response: "{}" };
		const findings = runRule(sequentialRule, [
			api("https://api.test/a", 0, 200, body),
			api("https://api.test/b", 210, 200, body),
			api("https://api.test/c", 420, 200, body),
			api("https://api.test/d", 630, 200, body),
			// An unrelated call that also starts right after b ends.
			api("https://api.test/x", 215, 100, body),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.chain).toEqual([0, 1, 3, 4]);
	});
});
