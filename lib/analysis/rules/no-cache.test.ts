import { describe, expect, it } from "vitest";
import { runRule } from "../../testing/run-rule";
import { noCacheRule } from "./no-cache";

describe("no cache headers rule", () => {
	it("flags static files without Cache-Control or Expires", () => {
		const findings = runRule(noCacheRule, [
			{ url: "https://cdn.test/app.3f9a2c1b.js", type: "script", mime: "text/javascript", size: 900_000, transfer: 300_000 },
			{ url: "https://cdn.test/logo.png", type: "image", mime: "image/png", transfer: 12_000 },
			{ url: "https://cdn.test/ok.css", type: "stylesheet", mime: "text/css", resHeaders: { "cache-control": "max-age=3600" } },
			{ url: "https://cdn.test/old.css", type: "stylesheet", mime: "text/css", resHeaders: { expires: "Thu, 01 Jan 2099 00:00:00 GMT" } },
		]);
		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding!.subject).toBe("cdn.test");
		expect(finding!.requestIds).toEqual([0, 1]);
		expect(finding!.impact.bytes).toBe(312_000);
		expect(finding!.fix).toMatch(/immutable/);
	});

	it("ignores API calls, cached responses and non-200s", () => {
		const findings = runRule(noCacheRule, [
			{ url: "https://api.test/cart", type: "fetch" },
			{ url: "https://cdn.test/a.js", type: "script", fromCache: "disk" },
			{ url: "https://cdn.test/b.js", type: "script", status: 304 },
		]);
		expect(findings).toHaveLength(0);
	});

	it("raises severity when more than 1 MB is uncached", () => {
		const findings = runRule(noCacheRule, [{ url: "https://cdn.test/big.js", type: "script", transfer: 1_500_000 }]);
		expect(findings[0]!.severity).toBe("medium");
	});
});
