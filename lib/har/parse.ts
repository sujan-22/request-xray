import type { Har } from "./types";

export type HarErrorCode = "empty" | "not-json" | "truncated" | "not-har" | "no-entries";

/** A parse failure with a message written for the person who dropped the file. */
export class HarError extends Error {
	readonly code: HarErrorCode;
	readonly detail: string | undefined;

	constructor(code: HarErrorCode, message: string, detail?: string) {
		super(message);
		this.name = "HarError";
		this.code = code;
		this.detail = detail;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseHar(text: string): Har {
	const trimmed = text.replace(/^﻿/, "").trim();
	if (!trimmed) throw new HarError("empty", "The file is empty.");

	const first = trimmed[0];
	if (first !== "{" && first !== "[") {
		const hint = first === "<" ? " It looks like HTML or XML." : "";
		throw new HarError(
			"not-json",
			`This file isn't JSON, so it can't be a HAR export.${hint}`,
			"In Chrome DevTools, open the Network panel, right-click any request and choose “Save all as HAR with content”.",
		);
	}

	let data: unknown;
	try {
		data = JSON.parse(trimmed);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/end of (JSON )?input|unterminated|Unexpected end/i.test(message)) {
			throw new HarError(
				"truncated",
				"The file ends early. It was probably cut off while saving or copying.",
				message,
			);
		}
		throw new HarError("not-json", "This file isn't valid JSON.", message);
	}

	// Some tools export a bare log, or an array of entries.
	if (Array.isArray(data)) data = { log: { entries: data } };
	if (isObject(data) && !isObject(data.log) && Array.isArray(data.entries)) data = { log: data };

	if (!isObject(data) || !isObject(data.log)) {
		throw new HarError("not-har", "This is JSON, but not a HAR file: there is no “log” object.");
	}
	if (!Array.isArray(data.log.entries)) {
		throw new HarError("not-har", "This HAR file has no list of requests (log.entries is missing).");
	}
	if (data.log.entries.length === 0) {
		throw new HarError(
			"no-entries",
			"The HAR file has no requests in it.",
			"Make sure recording is on in the Network panel before the page loads, then export again.",
		);
	}
	return data as unknown as Har;
}
