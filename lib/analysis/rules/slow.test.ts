import { describe, expect, it } from "vitest";
import { buildEntries } from "../../har/entries";
import { api, makeHar } from "../../testing/har-builder";
import { runRule } from "../../testing/run-rule";
import { dominantPhase, slowRule } from "./slow";

describe("slow rule", () => {
	it("flags requests over the threshold and blames the server when TTFB dominates", () => {
		const findings = runRule(slowRule, [
			api("https://api.test/search?q=a", 0, 2400, { timings: { wait: 2300, receive: 100 } }),
			api("https://api.test/fast", 0, 100),
		]);
		expect(findings).toHaveLength(1);
		const [finding] = findings;
		expect(finding!.subject).toBe("GET /search?q=a");
		expect(finding!.title).toBe("took 2.40 s");
		expect(finding!.why).toMatch(/waiting for the server/);
		expect(finding!.severity).toBe("medium");
		expect(finding!.impact.ms).toBe(1400);
	});

	it("groups slow calls to one endpoint", () => {
		const findings = runRule(slowRule, [
			api("https://api.test/items/1", 0, 1200),
			api("https://api.test/items/2", 0, 3600),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.title).toBe("was slow 2 times (average 2.40 s, slowest 3.60 s)");
		expect(findings[0]!.severity).toBe("high");
	});

	it("uses the configured threshold", () => {
		const specs = [api("https://api.test/a", 0, 600)];
		expect(runRule(slowRule, specs)).toHaveLength(0);
		expect(runRule(slowRule, specs, { slowMs: 500 })).toHaveLength(1);
	});

	it("ignores media and streams", () => {
		const findings = runRule(slowRule, [
			{ url: "https://cdn.test/v.mp4", type: "media", duration: 9000 },
			{ url: "https://api.test/events", type: "eventsource", mime: "text/event-stream", duration: 9000 },
		]);
		expect(findings).toHaveLength(0);
	});

	it("explains queueing and connection time", () => {
		const queued = runRule(slowRule, [api("https://a.test/x", 0, 1500, { timings: { blocked: 1200, wait: 200, receive: 100 } })]);
		expect(queued[0]!.why).toMatch(/queue/);
		const connecting = runRule(slowRule, [
			api("https://a.test/y", 0, 1500, { timings: { dns: 300, connect: 900, ssl: 500, wait: 200, receive: 100 } }),
		]);
		expect(connecting[0]!.why).toMatch(/DNS, TCP and TLS/);
	});

	it("dominantPhase averages across calls", () => {
		const { entries } = buildEntries(
			makeHar([
				api("https://a.test/1", 0, 1000, { timings: { wait: 100, receive: 900 } }),
				api("https://a.test/2", 0, 1000, { timings: { wait: 100, receive: 700 } }),
			]),
		);
		expect(dominantPhase(entries)).toEqual({ phase: "download", ms: 800 });
	});
});
