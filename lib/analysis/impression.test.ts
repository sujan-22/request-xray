import { describe, expect, it } from "vitest";
import type { Finding } from "../model";
import { headline, impressionOf, shortSubject } from "./impression";

const base: Finding = { id: "x", rule: "chatty", severity: "high", subject: "", title: "", why: "", fix: "", requestIds: [], impact: { ms: 0, bytes: 0 } };

describe("impression", () => {
	it("shortens subjects to the meaningful segment", () => {
		expect(shortSubject("GET /Commerce/Products({key})?api-version")).toBe("Products({key})");
		expect(shortSubject("GET /v1/items/{n}?page")).toBe("items/{n}");
		expect(shortSubject("POST /checkout")).toBe("checkout");
		expect(shortSubject("api.test")).toBe("api.test");
	});

	it("formats large counts in headlines", () => {
		const finding = { ...base, subject: "GET /v1/items/{n}", requestIds: Array.from({ length: 21_333 }, (_, i) => i) };
		expect(headline(finding)).toBe("items/{n} was called 21,333 times, once per id");
	});

	it("says so when nothing stood out", () => {
		const summary = { requests: 3, hosts: 1, duration: 420 } as Parameters<typeof impressionOf>[0]["summary"];
		expect(impressionOf({ summary, findings: [] })).toEqual({
			lead: "3 requests to one host over 420 ms.",
			highlight: null,
			tail: "Nothing stood out at the current thresholds.",
		});
	});
});
