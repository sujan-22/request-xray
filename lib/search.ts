import type { RequestRecord } from "./model";

/**
 * The waterfall filter: free text plus a few field prefixes.
 *   checkout            URL contains "checkout"
 *   -analytics          URL does not contain "analytics"
 *   method:post         method is POST (comma for several: method:post,put)
 *   status:4xx          status class; also status:404 or status:failed
 *   type:api            resource type (api, document, script, style, image, font, media, other)
 *   host:cdn            host contains "cdn"
 *   larger:100kb        response larger than 100 kB (also slower:500ms)
 */
export interface Search {
	include: string[];
	exclude: string[];
	methods: string[];
	statuses: string[];
	types: string[];
	hosts: string[];
	minBytes: number | null;
	minMs: number | null;
}

const SIZE = /^(\d+(?:\.\d+)?)(b|kb|mb)?$/i;
const TIME = /^(\d+(?:\.\d+)?)(ms|s)?$/i;

export function parseSearch(input: string): Search {
	const search: Search = { include: [], exclude: [], methods: [], statuses: [], types: [], hosts: [], minBytes: null, minMs: null };
	for (const token of input.trim().split(/\s+/).filter(Boolean)) {
		const colon = token.indexOf(":");
		const key = colon > 0 ? token.slice(0, colon).toLowerCase() : "";
		const value = colon > 0 ? token.slice(colon + 1).toLowerCase() : "";
		if (key && value) {
			const values = value.split(",").filter(Boolean);
			if (key === "method" || key === "m") {
				search.methods.push(...values.map((v) => v.toUpperCase()));
				continue;
			}
			if (key === "status" || key === "s") {
				search.statuses.push(...values);
				continue;
			}
			if (key === "type" || key === "t") {
				search.types.push(...values);
				continue;
			}
			if (key === "host" || key === "h") {
				search.hosts.push(...values);
				continue;
			}
			if (key === "larger") {
				const match = SIZE.exec(value);
				if (match) {
					const unit = (match[2] ?? "b").toLowerCase();
					search.minBytes = Number(match[1]) * (unit === "mb" ? 1e6 : unit === "kb" ? 1e3 : 1);
					continue;
				}
			}
			if (key === "slower") {
				const match = TIME.exec(value);
				if (match) {
					search.minMs = Number(match[1]) * ((match[2] ?? "ms").toLowerCase() === "s" ? 1000 : 1);
					continue;
				}
			}
		}
		if (token.startsWith("-") && token.length > 1) search.exclude.push(token.slice(1).toLowerCase());
		else search.include.push(token.toLowerCase());
	}
	return search;
}

function statusMatches(record: RequestRecord, pattern: string): boolean {
	if (pattern === "failed" || pattern === "error" || pattern === "err") return record.failed || record.status >= 400;
	if (/^\dxx$/.test(pattern)) return Math.floor(record.status / 100) === Number(pattern[0]);
	return String(record.status) === pattern;
}

export function isEmptySearch(search: Search): boolean {
	return (
		!search.include.length &&
		!search.exclude.length &&
		!search.methods.length &&
		!search.statuses.length &&
		!search.types.length &&
		!search.hosts.length &&
		search.minBytes === null &&
		search.minMs === null
	);
}

export function matchSearch(record: RequestRecord, search: Search): boolean {
	const haystack = `${record.method} ${record.url}`.toLowerCase();
	if (search.include.some((text) => !haystack.includes(text))) return false;
	if (search.exclude.some((text) => haystack.includes(text))) return false;
	if (search.methods.length && !search.methods.includes(record.method)) return false;
	if (search.statuses.length && !search.statuses.some((pattern) => statusMatches(record, pattern))) return false;
	if (search.types.length && !search.types.includes(record.type)) return false;
	if (search.hosts.length && !search.hosts.some((host) => record.host.toLowerCase().includes(host))) return false;
	if (search.minBytes !== null && record.contentSize < search.minBytes) return false;
	if (search.minMs !== null && record.duration < search.minMs) return false;
	return true;
}
