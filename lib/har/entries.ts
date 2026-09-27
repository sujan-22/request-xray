import { hashString } from "../hash";
import type { PageInfo, RequestRecord, Timings } from "../model";
import { isODataRequest } from "../odata/detect";
import { requestText } from "./body";
import { displayName, endpointKey, siteOf } from "./endpoint";
import { toHeaderMap, type HeaderMap } from "./headers";
import { resourceType } from "./resource-type";
import type { Har, HarEntry, HarInitiator } from "./types";

/**
 * A request as the analysis sees it: the lightweight record the UI gets, plus
 * the parsed headers, request body and raw entry that stay in the worker.
 */
export interface Entry extends RequestRecord {
	raw: HarEntry;
	reqHeaders: HeaderMap;
	resHeaders: HeaderMap;
	requestBody: string | null;
	/** method + URL + body hash: identical calls share it. */
	dedupeKey: string;
}

export interface BuiltEntries {
	entries: Entry[];
	pages: PageInfo[];
	primaryHost: string;
	skipped: number;
	warnings: string[];
}

function positive(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeTimings(raw: HarEntry): Timings {
	const t = raw.timings ?? {};
	const ssl = positive(t.ssl);
	return {
		blocked: positive(t.blocked),
		dns: positive(t.dns),
		// HAR counts TLS inside connect.
		connect: Math.max(0, positive(t.connect) - ssl),
		ssl,
		send: positive(t.send),
		wait: positive(t.wait),
		receive: positive(t.receive),
	};
}

function normalizeProtocol(version: string | undefined): string {
	if (!version) return "";
	const v = version.toLowerCase();
	if (v === "http/2.0" || v === "http/2" || v === "h2") return "h2";
	if (v === "http/3" || v === "http/3.0" || v.startsWith("h3")) return "h3";
	return v;
}

function fileOf(url: string | undefined): string {
	if (!url) return "";
	try {
		const parsed = new URL(url);
		return displayName(parsed);
	} catch {
		return url.split("/").pop() ?? url;
	}
}

function initiatorLabel(initiator: HarInitiator | undefined): string | null {
	if (!initiator?.type) return null;
	if (initiator.type === "parser") {
		const line = typeof initiator.lineNumber === "number" ? `:${initiator.lineNumber + 1}` : "";
		return `parser · ${fileOf(initiator.url)}${line}`;
	}
	if (initiator.type === "script") {
		let stack = initiator.stack;
		while (stack) {
			const frame = stack.callFrames?.find((f) => f.url);
			if (frame) {
				const fn = frame.functionName ? `${frame.functionName} · ` : "";
				const line = typeof frame.lineNumber === "number" ? `:${frame.lineNumber + 1}` : "";
				return `script · ${fn}${fileOf(frame.url)}${line}`;
			}
			stack = stack.parent;
		}
		return "script";
	}
	return initiator.type;
}

function transferSize(raw: HarEntry): number {
	const res = raw.response ?? {};
	const chrome = res._transferSize ?? raw._transferSize;
	if (typeof chrome === "number" && chrome >= 0) return chrome;
	const body = typeof res.bodySize === "number" ? res.bodySize : -1;
	const headers = typeof res.headersSize === "number" ? res.headersSize : -1;
	if (body >= 0 && headers >= 0) return body + headers;
	if (body >= 0) return body;
	return -1;
}

export function buildEntries(har: Har): BuiltEntries {
	const warnings: string[] = [];
	const rawEntries = Array.isArray(har.log.entries) ? har.log.entries : [];
	const rawPages = Array.isArray(har.log.pages) ? har.log.pages : [];

	interface Staged {
		raw: HarEntry;
		url: URL;
		startMs: number;
		order: number;
	}

	const staged: Staged[] = [];
	let skipped = 0;
	let dataUrls = 0;
	let badTimes = 0;
	let lastGoodStart = Number.NaN;

	rawEntries.forEach((raw, order) => {
		if (!raw || typeof raw !== "object" || typeof raw.request?.url !== "string") {
			skipped++;
			return;
		}
		let url: URL;
		try {
			url = new URL(raw.request.url);
		} catch {
			skipped++;
			return;
		}
		if (url.protocol === "data:" || url.protocol === "blob:") {
			dataUrls++;
			return;
		}
		let startMs = Date.parse(raw.startedDateTime ?? "");
		if (Number.isNaN(startMs)) {
			badTimes++;
			startMs = Number.isNaN(lastGoodStart) ? 0 : lastGoodStart;
		} else {
			lastGoodStart = startMs;
		}
		staged.push({ raw, url, startMs, order });
	});

	if (skipped) warnings.push(`Skipped ${skipped} ${skipped === 1 ? "entry" : "entries"} without a usable URL.`);
	if (dataUrls) warnings.push(`Ignored ${dataUrls} inline data: or blob: ${dataUrls === 1 ? "URL" : "URLs"}.`);
	if (badTimes) warnings.push(`${badTimes} ${badTimes === 1 ? "entry has" : "entries have"} no valid start time; placed after the previous request.`);

	staged.sort((a, b) => a.startMs - b.startMs || a.order - b.order);

	const pageStarts = rawPages.map((page) => Date.parse(page.startedDateTime ?? "")).filter((ms) => !Number.isNaN(ms));
	const zero = Math.min(staged[0]?.startMs ?? 0, ...pageStarts);

	const pageIndex = new Map<string, number>();
	const pages: PageInfo[] = rawPages.map((page, index) => {
		const id = page.id ?? `page_${index + 1}`;
		pageIndex.set(id, index);
		const startParsed = Date.parse(page.startedDateTime ?? "");
		const start = Number.isNaN(startParsed) ? 0 : startParsed - zero;
		const onContentLoad = positive(page.pageTimings?.onContentLoad);
		const onLoad = positive(page.pageTimings?.onLoad);
		return {
			id,
			title: page.title ?? "",
			start,
			onContentLoad: onContentLoad ? start + onContentLoad : null,
			onLoad: onLoad ? start + onLoad : null,
		};
	});

	// Primary host: the first document request, else the most common host.
	const firstDocument = staged.find((s) => s.raw._resourceType === "document" || /text\/html/.test(s.raw.response?.content?.mimeType ?? ""));
	let primaryHost = firstDocument?.url.host ?? "";
	if (!primaryHost) {
		const counts = new Map<string, number>();
		for (const s of staged) counts.set(s.url.host, (counts.get(s.url.host) ?? 0) + 1);
		primaryHost = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
	}
	const primarySite = siteOf(primaryHost);

	const entries = staged.map(({ raw, url, startMs }, id): Entry => {
		const request = raw.request ?? {};
		const response = raw.response ?? {};
		const method = (request.method ?? "GET").toUpperCase();
		const reqHeaders = toHeaderMap(request.headers);
		const resHeaders = toHeaderMap(response.headers);
		const timings = normalizeTimings(raw);
		const phaseSum = timings.blocked + timings.dns + timings.connect + timings.ssl + timings.send + timings.wait + timings.receive;
		const duration = typeof raw.time === "number" && Number.isFinite(raw.time) && raw.time >= 0 ? raw.time : phaseSum;
		const start = startMs - zero;
		const status = typeof response.status === "number" ? response.status : 0;
		const error = response._error ? String(response._error) : null;
		const mimeType = response.content?.mimeType ?? resHeaders["content-type"] ?? "";
		const requestBody = requestText(raw);
		const contentSize = positive(response.content?.size) || (typeof response.content?.text === "string" && response.content.encoding !== "base64" ? response.content.text.length : 0);
		const fromCache = raw._fromCache === "memory" || raw._fromCache === "disk" ? raw._fromCache : null;
		const type = resourceType(raw._resourceType, method, url.pathname, mimeType, reqHeaders);

		return {
			id,
			method,
			url: url.href,
			host: url.host,
			path: url.pathname,
			search: url.search,
			name: displayName(url),
			endpoint: endpointKey(method, url),
			status,
			statusText: response.statusText ?? "",
			failed: status === 0 || error !== null,
			error,
			type,
			mimeType,
			start,
			duration,
			end: start + duration,
			timings,
			transferSize: transferSize(raw),
			contentSize,
			requestBodySize: requestBody?.length ?? 0,
			encoding: resHeaders["content-encoding"]?.toLowerCase() ?? null,
			fromCache,
			protocol: normalizeProtocol(response.httpVersion || request.httpVersion),
			priority: raw._priority ?? null,
			initiator: initiatorLabel(raw._initiator),
			pageIndex: raw.pageref ? (pageIndex.get(raw.pageref) ?? 0) : 0,
			firstParty: siteOf(url.host) === primarySite,
			odata: isODataRequest(url, reqHeaders, resHeaders),
			raw,
			reqHeaders,
			resHeaders,
			requestBody,
			dedupeKey: `${method} ${url.href}\n${requestBody ? hashString(requestBody) : ""}`,
		};
	});

	return { entries, pages, primaryHost, skipped, warnings };
}

/** Strip the worker-only fields before sending a record to the UI. */
export function toRecord(entry: Entry): RequestRecord {
	const { raw: _raw, reqHeaders: _req, resHeaders: _res, requestBody: _body, dedupeKey: _key, ...record } = entry;
	return record;
}
