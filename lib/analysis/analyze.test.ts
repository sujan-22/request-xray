import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHar } from "../har/parse";
import type { Har } from "../har/types";
import { api, makeHar } from "../testing/har-builder";
import { analyze, buildReport } from "./analyze";
import { impressionOf } from "./impression";

const SAMPLE = join(__dirname, "../../public/samples/fernwood-storefront.har");

describe("analyze: the synthetic storefront sample", () => {
	const har = parseHar(readFileSync(SAMPLE, "utf8"));
	const { report, prepared } = analyze(har, { fileName: "fernwood-storefront.har", fileSize: 1 });
	const byRule = (rule: string) => report.findings.filter((f) => f.rule === rule);

	it("raises every kind of finding it was built to show", () => {
		const rules = new Set(report.findings.map((f) => f.rule));
		for (const rule of ["duplicate", "chatty", "sequential", "slow", "large-response", "no-compression", "no-cache", "errors", "odata-overfetch"]) {
			expect(rules, rule).toContain(rule);
		}
	});

	it("finds the designed sequential chain, and only that one", () => {
		const chains = byRule("sequential");
		expect(chains).toHaveLength(1);
		const names = chains[0]!.chain!.map((id) => report.requests[id]!.name);
		expect(names).toEqual(["Me", "Configuration", "Promotions", "Categories"]);
	});

	it("does not chain the cart call to the cart lines call that needs its id", () => {
		const chained = new Set(byRule("sequential").flatMap((f) => f.chain ?? []));
		const lines = report.requests.find((r) => r.name === "CartLines")!;
		expect(chained.has(lines.id)).toBe(false);
	});

	it("counts the product lookups and the repeated cart calls", () => {
		expect(byRule("chatty")[0]!.requestIds).toHaveLength(20);
		const cart = byRule("duplicate").find((f) => f.subject.includes("Carts/Current"))!;
		expect(cart.requestIds).toHaveLength(4);
		expect(cart.severity).toBe("high");
	});

	it("summarises the capture", () => {
		expect(report.summary.requests).toBe(64);
		expect(report.summary.hosts).toBe(4);
		expect(report.summary.primaryHost).toBe("shop.fernwood.example");
		expect(report.summary.onLoad).toBeCloseTo(1262.7);
		expect(report.pages).toHaveLength(1);
		expect(prepared.entries.filter((e) => e.odata).length).toBeGreaterThan(20);
	});

	it("sorts findings by severity, then impact", () => {
		const rank = { high: 0, medium: 1, low: 2 } as const;
		const ranks = report.findings.map((f) => rank[f.severity]);
		expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
	});

	it("writes a plain impression with no em dashes", () => {
		const impression = impressionOf(report);
		expect(impression.lead).toBe("64 requests to 4 hosts over 4.37 s.");
		const text = [impression.lead, impression.highlight, impression.tail, ...report.findings.flatMap((f) => [f.title, f.why, f.fix])].join(" ");
		expect(text).not.toContain("—");
	});

	it("re-runs rules with new settings without re-parsing", () => {
		const strict = buildReport(prepared, har, { settings: { slowMs: 300 } });
		expect(strict.findings.filter((f) => f.rule === "slow").length).toBeGreaterThan(byRule("slow").length);
		expect(strict.requests).toHaveLength(report.requests.length);
	});
});

describe("analyze: hostile input", () => {
	it("survives entries with missing or nonsense fields", () => {
		const har = {
			log: {
				entries: [
					{ request: { url: "https://a.test/ok" }, response: { status: 200 } },
					{ request: { url: "https://a.test/no-response" } },
					{ request: { url: "https://a.test/bad-time", method: "post" }, startedDateTime: "yesterday", time: Number.NaN },
					{ request: { url: "https://a.test/neg" }, timings: { wait: -1, receive: -1, blocked: -1 }, time: -1 },
					{ request: { url: 42 } },
					null,
					"string entry",
				],
			},
		} as unknown as Har;
		const { report } = analyze(har);
		expect(report.requests).toHaveLength(4);
		expect(report.meta.skipped).toBe(3);
		for (const r of report.requests) {
			expect(Number.isFinite(r.start)).toBe(true);
			expect(Number.isFinite(r.duration)).toBe(true);
			expect(r.duration).toBeGreaterThanOrEqual(0);
		}
		expect(report.requests.find((r) => r.name === "bad-time")!.method).toBe("POST");
	});

	it("analyses 20,000 requests quickly", () => {
		const specs = Array.from({ length: 20_000 }, (_, i) =>
			api(`https://api.test/items/${i % 400}?page=${i % 7}`, i * 3, 40 + (i % 90), { response: `{"id":${i}}` }),
		);
		const har = makeHar(specs);
		const started = performance.now();
		const { report } = analyze(har);
		const elapsed = performance.now() - started;
		expect(report.requests).toHaveLength(20_000);
		expect(elapsed).toBeLessThan(4000);
	});
});
