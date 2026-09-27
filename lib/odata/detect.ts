import type { HeaderMap } from "../har/headers";

/** OData system query options, v2 to v4.01. */
export const SYSTEM_OPTIONS = [
	"$filter",
	"$select",
	"$expand",
	"$orderby",
	"$top",
	"$skip",
	"$count",
	"$inlinecount",
	"$search",
	"$apply",
	"$compute",
	"$format",
	"$skiptoken",
	"$deltatoken",
	"$levels",
	"$index",
	"$schemaversion",
] as const;

const OPTION_SET = new Set<string>(SYSTEM_OPTIONS);

export function hasSystemOption(search: string): boolean {
	if (!search) return false;
	for (const pair of search.replace(/^\?/, "").split("&")) {
		let key = pair.split("=")[0] ?? "";
		try {
			key = decodeURIComponent(key);
		} catch {
			// keep the raw key
		}
		if (OPTION_SET.has(key.toLowerCase())) return true;
	}
	return false;
}

/**
 * Generic OData signals only: system query options, the OData-Version header,
 * odata in the content type, or the $batch / $metadata paths.
 */
export function isODataRequest(url: URL, reqHeaders: HeaderMap, resHeaders: HeaderMap): boolean {
	if (hasSystemOption(url.search)) return true;
	if (/\/\$(batch|metadata)$/i.test(url.pathname)) return true;
	if (reqHeaders["odata-version"] || reqHeaders["odata-maxversion"] || reqHeaders["dataserviceversion"]) return true;
	if (resHeaders["odata-version"] || resHeaders["dataserviceversion"]) return true;
	if (/odata/i.test(resHeaders["content-type"] ?? "")) return true;
	return false;
}
