import { describe, expect, it } from "vitest";
import { HarError, parseHar } from "./parse";

function codeOf(text: string): string | undefined {
	try {
		parseHar(text);
		return undefined;
	} catch (error) {
		return error instanceof HarError ? error.code : "unexpected";
	}
}

describe("parseHar", () => {
	it("accepts a minimal HAR", () => {
		const har = parseHar(JSON.stringify({ log: { entries: [{ request: { url: "https://a.test/" } }] } }));
		expect(har.log.entries).toHaveLength(1);
	});

	it("strips a byte order mark and surrounding whitespace", () => {
		const har = parseHar(`﻿  \n${JSON.stringify({ log: { entries: [{}] } })}\n`);
		expect(har.log.entries).toHaveLength(1);
	});

	it("rejects an empty file", () => {
		expect(codeOf("")).toBe("empty");
		expect(codeOf("   \n\t")).toBe("empty");
	});

	it("rejects non-JSON and hints at HTML", () => {
		expect(codeOf("hello")).toBe("not-json");
		try {
			parseHar("<!doctype html><html></html>");
		} catch (error) {
			expect((error as HarError).message).toMatch(/HTML/);
		}
	});

	it("reports a truncated file separately from invalid JSON", () => {
		const full = JSON.stringify({ log: { entries: [{ request: { url: "https://a.test/" } }] } });
		expect(codeOf(full.slice(0, full.length - 10))).toBe("truncated");
		expect(codeOf('{"log": {"entries": [1,,2]}}')).toBe("not-json");
	});

	it("rejects JSON that isn't a HAR", () => {
		expect(codeOf('{"name": "package"}')).toBe("not-har");
		expect(codeOf('{"log": {"pages": []}}')).toBe("not-har");
		expect(codeOf('"just a string"')).toBe("not-json");
	});

	it("rejects a HAR with no entries", () => {
		expect(codeOf('{"log": {"entries": []}}')).toBe("no-entries");
	});

	it("accepts a bare log or a bare entries array", () => {
		expect(parseHar('{"entries": [{}]}').log.entries).toHaveLength(1);
		expect(parseHar("[{}, {}]").log.entries).toHaveLength(2);
	});
});
