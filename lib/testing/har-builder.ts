/**
 * Builds synthetic HAR files for tests. Everything here is made up: no test
 * depends on a real capture (see CLAUDE.md, "No real client data in the repo").
 */
import type { Har, HarEntry, HarPage, HarTimings } from "../har/types";

export const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

export interface EntrySpec {
	url: string;
	method?: string;
	/** ms after BASE_TIME */
	start?: number;
	duration?: number;
	status?: number;
	statusText?: string;
	/** Chrome _resourceType; omit to test inference. */
	type?: string;
	mime?: string;
	/** Decoded body size; defaults to the response text length. */
	size?: number;
	/** Chrome _transferSize */
	transfer?: number;
	reqHeaders?: Record<string, string>;
	resHeaders?: Record<string, string>;
	body?: string;
	response?: string;
	timings?: Partial<HarTimings>;
	fromCache?: "memory" | "disk";
	error?: string;
	pageref?: string;
	raw?: Partial<HarEntry>;
}

function headerList(headers: Record<string, string> | undefined) {
	return Object.entries(headers ?? {}).map(([name, value]) => ({ name, value }));
}

export function makeEntry(spec: EntrySpec): HarEntry {
	const duration = spec.duration ?? 100;
	const mime = spec.mime ?? "application/json";
	const text = spec.response ?? "";
	// No response given means "not recorded": no text field, like an export without content.
	const content = spec.response === undefined ? {} : { text: spec.response };
	const timings: HarTimings = {
		blocked: 0,
		dns: -1,
		connect: -1,
		ssl: -1,
		send: 0,
		wait: Math.round(duration * 0.8 * 1000) / 1000,
		receive: Math.round(duration * 0.2 * 1000) / 1000,
		...spec.timings,
	};
	const resHeaders = { "content-type": mime, ...spec.resHeaders };
	return {
		startedDateTime: new Date(BASE_TIME + (spec.start ?? 0)).toISOString(),
		time: duration,
		pageref: spec.pageref,
		request: {
			method: spec.method ?? "GET",
			url: spec.url,
			httpVersion: "h2",
			headers: headerList(spec.reqHeaders),
			queryString: [],
			cookies: [],
			headersSize: -1,
			bodySize: spec.body ? spec.body.length : 0,
			...(spec.body !== undefined ? { postData: { mimeType: "application/json", text: spec.body } } : {}),
		},
		response: {
			status: spec.status ?? 200,
			statusText: spec.statusText ?? (spec.status === undefined || spec.status === 200 ? "OK" : ""),
			httpVersion: "h2",
			headers: headerList(resHeaders),
			cookies: [],
			content: { size: spec.size ?? text.length, mimeType: mime, ...content },
			redirectURL: "",
			headersSize: -1,
			bodySize: spec.transfer ?? spec.size ?? text.length,
			...(spec.transfer !== undefined ? { _transferSize: spec.transfer } : {}),
			...(spec.error ? { _error: spec.error } : {}),
		},
		cache: {},
		timings,
		...(spec.type ? { _resourceType: spec.type } : {}),
		...(spec.fromCache ? { _fromCache: spec.fromCache } : {}),
		...spec.raw,
	};
}

export function makeHar(specs: EntrySpec[], pages?: HarPage[]): Har {
	return {
		log: {
			version: "1.2",
			creator: { name: "request-xray tests", version: "1" },
			pages: pages ?? [],
			entries: specs.map(makeEntry),
		},
	};
}

/** Shorthand for an API call. */
export function api(url: string, start: number, duration: number, extra: Partial<EntrySpec> = {}): EntrySpec {
	return { url, start, duration, type: "fetch", resHeaders: { "content-encoding": "br" }, ...extra };
}
