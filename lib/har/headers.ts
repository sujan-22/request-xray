import type { HarNameValue } from "./types";

/** Lowercased header name → value. Repeated headers are joined, as HTTP allows. */
export type HeaderMap = Record<string, string>;

export function toHeaderMap(list: HarNameValue[] | undefined): HeaderMap {
	const map: HeaderMap = {};
	if (!Array.isArray(list)) return map;
	for (const item of list) {
		if (!item || typeof item.name !== "string") continue;
		const name = item.name.toLowerCase();
		// HTTP/2 pseudo-headers (:method, :path...) duplicate the request line.
		if (name.startsWith(":")) continue;
		const value = typeof item.value === "string" ? item.value : "";
		const existing = map[name];
		if (existing === undefined) map[name] = value;
		else map[name] = existing + (name === "set-cookie" ? "\n" : ", ") + value;
	}
	return map;
}

/** Media type without parameters: "application/json; charset=utf-8" → "application/json". */
export function baseMime(mime: string | undefined | null): string {
	if (!mime) return "";
	return mime.split(";")[0]!.trim().toLowerCase();
}

const TEXT_MIME =
	/^(text\/|application\/(json|.*\+json|javascript|x-javascript|ecmascript|xml|.*\+xml|x-www-form-urlencoded|graphql|ld\+json|manifest\+json)|image\/svg\+xml)/;

export function isTextMime(mime: string | undefined | null): boolean {
	return TEXT_MIME.test(baseMime(mime));
}

export function isJsonMime(mime: string | undefined | null): boolean {
	return /json/.test(baseMime(mime));
}
