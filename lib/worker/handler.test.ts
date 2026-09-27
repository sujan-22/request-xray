import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model";
import { api, makeHar } from "../testing/har-builder";
import { createHandler } from "./handler";
import type { WorkerResponse } from "./protocol";

function setup() {
	const messages: WorkerResponse[] = [];
	const handle = createHandler((message) => messages.push(message));
	return { messages, handle };
}

const har = makeHar([
	api("https://api.test/odata/Products?$filter=Price%20gt%2010&$top=5", 0, 120, {
		response: '{"@odata.context":"x","@odata.count":42,"value":[{"Id":1},{"Id":2}]}',
		resHeaders: { "odata-version": "4.0", "content-encoding": "br" },
		reqHeaders: { authorization: "Bearer abc.def.ghi" },
	}),
	api("https://api.test/odata/Products?$filter=Price%20gt%2020&$top=5", 200, 140, { response: '{"value":[{"Id":3}]}' }),
]);

describe("worker handler", () => {
	it("loads a file with progress, then reports", async () => {
		const { messages, handle } = setup();
		await handle({ id: 1, type: "load", file: new Blob([JSON.stringify(har)]), name: "test.har", settings: DEFAULT_SETTINGS });
		const stages = messages.filter((m) => m.type === "progress").map((m) => (m.type === "progress" ? m.stage : ""));
		expect(stages).toContain("reading");
		expect(stages).toContain("parsing");
		expect(stages).toContain("analyzing");
		const report = messages.find((m) => m.type === "report");
		expect(report?.type === "report" && report.report.requests.length).toBe(2);
		expect(report?.type === "report" && report.report.meta.fileName).toBe("test.har");
	});

	it("returns a detail with decoded OData", async () => {
		const { messages, handle } = setup();
		await handle({ id: 1, type: "load", file: new Blob([JSON.stringify(har)]), name: "t.har", settings: DEFAULT_SETTINGS });
		await handle({ id: 2, type: "detail", requestId: 0 });
		const detail = messages.find((m) => m.type === "detail");
		if (detail?.type !== "detail") throw new Error("no detail");
		expect(detail.detail.odata?.query.filter?.english).toBe("Price is greater than 10");
		expect(detail.detail.odata?.count).toBe(42);
		expect(detail.detail.odata?.items).toBe(2);
		expect(detail.detail.responseBody?.json).toBe(true);
	});

	it("diffs two requests", async () => {
		const { messages, handle } = setup();
		await handle({ id: 1, type: "load", file: new Blob([JSON.stringify(har)]), name: "t.har", settings: DEFAULT_SETTINGS });
		await handle({ id: 2, type: "diff", a: 0, b: 1 });
		const diff = messages.find((m) => m.type === "diff");
		if (diff?.type !== "diff") throw new Error("no diff");
		expect(diff.diff.query.find((row) => row.name === "$filter")?.status).toBe("changed");
		expect(diff.diff.requestHeaders.find((row) => row.name === "authorization")?.status).toBe("removed");
		expect(diff.diff.responseBody.identical).toBe(false);
	});

	it("re-analyses with new settings", async () => {
		const { messages, handle } = setup();
		await handle({ id: 1, type: "load", file: new Blob([JSON.stringify(har)]), name: "t.har", settings: DEFAULT_SETTINGS });
		await handle({ id: 2, type: "settings", settings: { ...DEFAULT_SETTINGS, slowMs: 100 } });
		const reports = messages.filter((m) => m.type === "report");
		expect(reports).toHaveLength(2);
		const last = reports[1]!;
		const slow = last.type === "report" ? last.report.findings.filter((f) => f.rule === "slow") : [];
		// Both calls share one endpoint, so they're grouped into a single finding.
		expect(slow).toHaveLength(1);
		expect(slow[0]!.requestIds).toEqual([0, 1]);
	});

	it("exports a sanitized HAR without the token", async () => {
		const { messages, handle } = setup();
		await handle({ id: 1, type: "load", file: new Blob([JSON.stringify(har)]), name: "t.har", settings: DEFAULT_SETTINGS });
		await handle({ id: 2, type: "export", format: "har", options: { emails: true, headers: false, responseBodies: false } });
		const exported = messages.find((m) => m.type === "export");
		if (exported?.type !== "export") throw new Error("no export");
		expect(exported.fileName).toBe("t.sanitized.har");
		const text = await exported.blob.text();
		expect(text).not.toContain("abc.def.ghi");
		expect(exported.stats.headers).toBe(1);
	});

	it("reports friendly errors", async () => {
		const { messages, handle } = setup();
		await handle({ id: 1, type: "load", file: new Blob(['{"log": {"entries": [']), name: "bad.har", settings: DEFAULT_SETTINGS });
		const error = messages.find((m) => m.type === "error");
		expect(error?.type === "error" && error.error.code).toBe("truncated");
		await handle({ id: 2, type: "detail", requestId: 5 });
		expect(messages.filter((m) => m.type === "error")).toHaveLength(2);
	});
});
