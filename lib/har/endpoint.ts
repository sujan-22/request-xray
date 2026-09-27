/**
 * Endpoint normalization: turn concrete URLs into patterns so that
 * /api/products/123 and /api/products/456 count as one endpoint.
 */

const GUID = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
const NUMBER = /^-?\d+(\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
const HEX_HASH = /^(?=[a-f0-9]*\d)(?=[a-f0-9]*[a-f])[a-f0-9]{8,}$/i;
/** Long mixed tokens such as base64url ids, ULIDs or opaque keys. */
const OPAQUE_ID = /^(?=.*\d)(?=.*[a-z])[a-z0-9_-]{16,}$/i;
/** OData key segment: Products(42), Carts('abc'), Orders(Id=1,Line=2). Not Products(). */
const ODATA_KEY = /^([^()]+)\((.+)\)$/;

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function placeholderFor(token: string): string | null {
	if (NUMBER.test(token)) return "{n}";
	if (GUID.test(token)) return "{guid}";
	if (DATE.test(token)) return "{date}";
	if (HEX_HASH.test(token)) return "{hash}";
	if (OPAQUE_ID.test(token)) return "{id}";
	if (token.includes("@") && token.length > 3) return "{id}";
	return null;
}

export function normalizeSegment(raw: string): string {
	const segment = safeDecode(raw);
	if (!segment) return segment;

	const whole = placeholderFor(segment);
	if (whole) return whole;

	const odata = ODATA_KEY.exec(segment);
	if (odata) return `${odata[1]}({key})`;

	// Slug-with-id and hashed file names: red-shoe-12345, main.3f9a2c1b.js
	if (/[.\-_]/.test(segment)) {
		const parts = segment.split(/([.\-_])/);
		const lastIndex = parts.length - 1;
		let changed = false;
		const next = parts.map((part, index) => {
			const isSeparator = index % 2 === 1;
			const isExtension = index === lastIndex && /^[a-z][a-z0-9]{0,4}$/i.test(part);
			if (isSeparator || isExtension) return part;
			const placeholder = placeholderFor(part);
			if (placeholder) {
				changed = true;
				return placeholder;
			}
			return part;
		});
		if (changed) return next.join("");
	}
	return segment;
}

export function normalizePath(pathname: string): string {
	if (!pathname || pathname === "/") return "/";
	return pathname
		.split("/")
		.map((segment) => normalizeSegment(segment))
		.join("/");
}

export function queryKeys(search: string): string[] {
	if (!search || search === "?") return [];
	const keys = new Set<string>();
	for (const pair of search.replace(/^\?/, "").split("&")) {
		if (!pair) continue;
		const key = safeDecode(pair.split("=")[0]!.replace(/\+/g, " "));
		if (key) keys.add(key);
	}
	return [...keys].sort();
}

export function endpointPattern(url: URL): string {
	const keys = queryKeys(url.search);
	return normalizePath(url.pathname) + (keys.length ? `?${keys.join("&")}` : "");
}

export function endpointKey(method: string, url: URL): string {
	return `${method} ${url.host}${endpointPattern(url)}`;
}

/** A best-effort registrable domain (eTLD+1) without shipping the public suffix list. */
export function siteOf(host: string): string {
	const hostname = host.split(":")[0]!.toLowerCase();
	if (/^[\d.]+$/.test(hostname) || hostname.includes("[") || !hostname.includes(".")) return hostname;
	const labels = hostname.split(".");
	const tld = labels[labels.length - 1]!;
	const second = labels[labels.length - 2] ?? "";
	const take = tld.length === 2 && second.length <= 3 && labels.length > 2 ? 3 : 2;
	return labels.slice(-take).join(".");
}

/** The short name shown in lists: last path segment, else the host. */
export function displayName(url: URL): string {
	const segments = url.pathname.split("/").filter(Boolean);
	const last = segments[segments.length - 1];
	return last ? safeDecode(last) : url.host;
}
