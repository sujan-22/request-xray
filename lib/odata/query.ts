import { explainFilter, formatFilter, ODataSyntaxError, parseFilter, type Line } from "./filter";

export interface ExpandItem {
	path: string;
	select: string[];
	expand: ExpandItem[];
	/** Other nested options ($filter, $top, $orderby, $levels...) as written. */
	options: Array<{ name: string; value: string }>;
}

export interface OrderItem {
	expression: string;
	direction: "asc" | "desc";
}

export interface FilterView {
	raw: string;
	lines: Line[] | null;
	english: string | null;
	error: string | null;
}

export interface PathSegment {
	name: string;
	key: string | null;
}

export interface DecodedQuery {
	segments: PathSegment[];
	filter: FilterView | null;
	select: string[] | null;
	expand: ExpandItem[] | null;
	orderby: OrderItem[] | null;
	top: number | null;
	skip: number | null;
	count: boolean | null;
	search: string | null;
	/** Other system options ($apply, $compute, $format...) and custom parameters. */
	system: Array<{ name: string; value: string }>;
	custom: Array<{ name: string; value: string }>;
	/** "Page 3 · items 41 to 60" when $top and $skip allow it. */
	paging: string | null;
}

/** Split on a separator at nesting depth 0, ignoring separators inside quotes or parentheses. */
export function splitTopLevel(value: string, separator: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quoted = false;
	let current = "";
	for (const ch of value) {
		if (ch === "'") quoted = !quoted;
		else if (!quoted && ch === "(") depth++;
		else if (!quoted && ch === ")") depth = Math.max(0, depth - 1);
		if (ch === separator && depth === 0 && !quoted) {
			parts.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	parts.push(current);
	return parts.map((part) => part.trim()).filter(Boolean);
}

export function parseSelect(value: string): string[] {
	return splitTopLevel(value, ",");
}

export function parseOrderBy(value: string): OrderItem[] {
	return splitTopLevel(value, ",").map((item) => {
		const match = /^(.*?)\s+(asc|desc)$/i.exec(item);
		return match
			? { expression: match[1]!.trim(), direction: match[2]!.toLowerCase() as "asc" | "desc" }
			: { expression: item, direction: "asc" };
	});
}

export function parseExpand(value: string): ExpandItem[] {
	return splitTopLevel(value, ",").map((item) => {
		const open = item.indexOf("(");
		if (open === -1 || !item.endsWith(")")) return { path: item, select: [], expand: [], options: [] };
		const path = item.slice(0, open).trim();
		const inner = item.slice(open + 1, -1);
		const result: ExpandItem = { path, select: [], expand: [], options: [] };
		for (const option of splitTopLevel(inner, ";")) {
			const eq = option.indexOf("=");
			const name = (eq === -1 ? option : option.slice(0, eq)).trim();
			const optionValue = eq === -1 ? "" : option.slice(eq + 1).trim();
			const lower = name.toLowerCase();
			if (lower === "$select") result.select = parseSelect(optionValue);
			else if (lower === "$expand") result.expand = parseExpand(optionValue);
			else result.options.push({ name, value: optionValue });
		}
		return result;
	});
}

export function decodeFilter(raw: string): FilterView {
	try {
		const ast = parseFilter(raw);
		return { raw, lines: formatFilter(ast), english: explainFilter(ast), error: null };
	} catch (error) {
		const message = error instanceof ODataSyntaxError ? `${error.message} (at character ${error.position + 1})` : String(error);
		return { raw, lines: null, english: null, error: message };
	}
}

export function parseSegments(pathname: string): PathSegment[] {
	return pathname
		.split("/")
		.filter(Boolean)
		.map((segment) => {
			let decoded = segment;
			try {
				decoded = decodeURIComponent(segment);
			} catch {
				// keep the raw segment
			}
			const match = /^([^()]+)\((.*)\)$/.exec(decoded);
			return match ? { name: match[1]!, key: match[2]! } : { name: decoded, key: null };
		});
}

function toInt(value: string | undefined): number | null {
	if (value === undefined) return null;
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : null;
}

export function decodeQuery(url: URL): DecodedQuery {
	const params: Array<[string, string]> = [];
	// URLSearchParams turns "+" into a space, which is right for form encoding and what OData clients send.
	for (const [name, value] of new URLSearchParams(url.search)) params.push([name, value]);
	const get = (name: string) => params.find(([key]) => key.toLowerCase() === name)?.[1];

	const top = toInt(get("$top"));
	const skip = toInt(get("$skip"));
	const countRaw = get("$count") ?? get("$inlinecount");
	const filterRaw = get("$filter");
	const selectRaw = get("$select");
	const expandRaw = get("$expand");
	const orderRaw = get("$orderby");

	const handled = new Set(["$filter", "$select", "$expand", "$orderby", "$top", "$skip", "$count", "$inlinecount", "$search"]);
	const system: Array<{ name: string; value: string }> = [];
	const custom: Array<{ name: string; value: string }> = [];
	for (const [name, value] of params) {
		if (handled.has(name.toLowerCase())) continue;
		(name.startsWith("$") ? system : custom).push({ name, value });
	}

	let paging: string | null = null;
	if (top !== null && top > 0) {
		const from = (skip ?? 0) + 1;
		const page = Math.floor((skip ?? 0) / top) + 1;
		const aligned = (skip ?? 0) % top === 0;
		paging = `${aligned ? `Page ${page} · ` : ""}items ${from} to ${from + top - 1}`;
	}

	return {
		segments: parseSegments(url.pathname),
		filter: filterRaw !== undefined ? decodeFilter(filterRaw) : null,
		select: selectRaw !== undefined ? parseSelect(selectRaw) : null,
		expand: expandRaw !== undefined ? parseExpand(expandRaw) : null,
		orderby: orderRaw !== undefined ? parseOrderBy(orderRaw) : null,
		top,
		skip,
		count: countRaw === undefined ? null : countRaw === "true" || countRaw === "allpages",
		search: get("$search") ?? null,
		system,
		custom,
		paging,
	};
}
