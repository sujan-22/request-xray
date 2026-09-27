import { describe, expect, it } from "vitest";
import { api } from "../../testing/har-builder";
import { runRule } from "../../testing/run-rule";
import { largeResponseRule } from "./large-response";

describe("large response rule", () => {
	it("flags API responses over the API threshold", () => {
		const findings = runRule(largeResponseRule, [
			api("https://api.test/catalog", 0, 100, { size: 600_000, transfer: 90_000 }),
			api("https://api.test/small", 0, 100, { size: 20_000 }),
		]);
		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding!.title).toBe("returned 600 kB");
		expect(finding!.severity).toBe("medium");
		expect(finding!.impact.bytes).toBe(90_000);
	});

	it("uses the asset threshold for scripts and images", () => {
		const findings = runRule(largeResponseRule, [
			{ url: "https://cdn.test/vendor.js", type: "script", mime: "application/javascript", size: 600_000 },
			{ url: "https://cdn.test/hero.jpg", type: "image", mime: "image/jpeg", size: 4_500_000 },
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.subject).toBe("GET /hero.jpg");
		expect(findings[0]!.severity).toBe("high");
		expect(findings[0]!.fix).toMatch(/AVIF or WebP/);
	});

	it("honours custom thresholds", () => {
		const specs = [api("https://api.test/list", 0, 100, { size: 120_000 })];
		expect(runRule(largeResponseRule, specs)).toHaveLength(0);
		expect(runRule(largeResponseRule, specs, { largeApiKb: 100 })).toHaveLength(1);
	});

	it("suggests $select for OData", () => {
		const findings = runRule(largeResponseRule, [
			api("https://api.test/odata/Products?$top=500", 0, 100, { size: 800_000 }),
		]);
		expect(findings[0]!.fix).toMatch(/\$select/);
	});

	it("skips media", () => {
		expect(runRule(largeResponseRule, [{ url: "https://cdn.test/v.mp4", type: "media", size: 50_000_000 }])).toHaveLength(0);
	});
});
