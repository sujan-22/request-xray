import { describe, expect, it } from "vitest";
import { api } from "../../testing/har-builder";
import { runRule } from "../../testing/run-rule";
import { errorsRule } from "./errors";

describe("errors rule", () => {
	it("reports server errors as high severity", () => {
		const [finding] = runRule(errorsRule, [api("https://api.test/checkout", 0, 100, { method: "POST", status: 500, statusText: "Internal Server Error" })]);
		expect(finding!.severity).toBe("high");
		expect(finding!.title).toBe("returned 500 Internal Server Error");
		expect(finding!.subject).toBe("POST /checkout");
	});

	it("groups repeated errors on one endpoint", () => {
		const findings = runRule(errorsRule, [
			api("https://api.test/users/1", 0, 50, { status: 401, statusText: "Unauthorized" }),
			api("https://api.test/users/2", 60, 50, { status: 401, statusText: "Unauthorized" }),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.title).toBe("returned 401 Unauthorized (2 times)");
		expect(findings[0]!.severity).toBe("medium");
	});

	it("separates missing files, failures and cancellations", () => {
		const findings = runRule(errorsRule, [
			{ url: "https://a.test/favicon.ico", type: "image", status: 404, statusText: "Not Found" },
			api("https://ads.test/pixel", 0, 10, { status: 0, error: "net::ERR_BLOCKED_BY_CLIENT" }),
			api("https://api.test/search", 0, 10, { status: 0, error: "net::ERR_ABORTED" }),
		]);
		const byTitle = Object.fromEntries(findings.map((f) => [f.subject, f]));
		expect(byTitle["GET /favicon.ico"]!.why).toMatch(/doesn't exist/);
		expect(byTitle["GET /pixel"]!.title).toBe("failed (net::ERR_BLOCKED_BY_CLIENT)");
		expect(byTitle["GET /pixel"]!.severity).toBe("medium");
		expect(byTitle["GET /search"]!.severity).toBe("low");
	});

	it("ignores successful and redirect responses", () => {
		expect(runRule(errorsRule, [api("https://a.test/a", 0, 10), api("https://a.test/b", 0, 10, { status: 302 })])).toHaveLength(0);
	});
});
