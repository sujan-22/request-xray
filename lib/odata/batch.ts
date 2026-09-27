/**
 * OData $batch bodies: multipart/mixed (v2–v4, with nested changesets) and the
 * JSON batch format from OData 4.01. Works for both batch requests and batch
 * responses: each part is either a request line or a status line.
 */

export interface BatchPart {
	/** Present for requests. */
	method: string | null;
	url: string | null;
	/** Present for responses. */
	status: number | null;
	statusText: string | null;
	headers: Record<string, string>;
	body: string;
	/** Changeset boundary or JSON atomicityGroup the part belongs to. */
	group: string | null;
	id: string | null;
}

function boundaryFrom(contentType: string | undefined, body: string): string | null {
	const match = /boundary=("?)([^";]+)\1/i.exec(contentType ?? "");
	if (match) return match[2]!;
	const firstLine = /^\s*--([^\r\n]+)/.exec(body);
	return firstLine ? firstLine[1]!.trim() : null;
}

function splitHeaders(block: string): { headers: Record<string, string>; rest: string } {
	const normalized = block.replace(/\r\n/g, "\n");
	const blank = normalized.indexOf("\n\n");
	const head = blank === -1 ? normalized : normalized.slice(0, blank);
	const rest = blank === -1 ? "" : normalized.slice(blank + 2);
	const headers: Record<string, string> = {};
	for (const line of head.split("\n")) {
		const colon = line.indexOf(":");
		if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
	}
	return { headers, rest };
}

function parseHttpPart(content: string, group: string | null, id: string | null): BatchPart {
	const normalized = content.replace(/\r\n/g, "\n").replace(/^\n+/, "");
	const newline = normalized.indexOf("\n");
	const firstLine = (newline === -1 ? normalized : normalized.slice(0, newline)).trim();
	const { headers, rest } = splitHeaders(newline === -1 ? "" : normalized.slice(newline + 1));

	const response = /^HTTP\/[\d.]+\s+(\d{3})\s*(.*)$/i.exec(firstLine);
	if (response) {
		return { method: null, url: null, status: Number(response[1]), statusText: response[2] || null, headers, body: rest.trim(), group, id };
	}
	const request = /^([A-Z]+)\s+(\S+)(\s+HTTP\/[\d.]+)?$/i.exec(firstLine);
	return {
		method: request ? request[1]!.toUpperCase() : null,
		url: request ? request[2]! : firstLine || null,
		status: null,
		statusText: null,
		headers,
		body: rest.trim(),
		group,
		id,
	};
}

function parseMultipart(body: string, boundary: string, group: string | null): BatchPart[] {
	const parts: BatchPart[] = [];
	const delimiter = `--${boundary}`;
	const chunks = body.split(delimiter).slice(1);
	for (const chunk of chunks) {
		if (chunk.startsWith("--")) break;
		const { headers, rest } = splitHeaders(chunk.replace(/^\r?\n/, ""));
		const type = headers["content-type"] ?? "";
		if (/multipart\/mixed/i.test(type)) {
			const inner = boundaryFrom(type, rest);
			if (inner) parts.push(...parseMultipart(rest, inner, inner));
			continue;
		}
		parts.push(parseHttpPart(rest, group, headers["content-id"] ?? null));
	}
	return parts;
}

function parseJsonBatch(body: string): BatchPart[] | null {
	let data: unknown;
	try {
		data = JSON.parse(body);
	} catch {
		return null;
	}
	if (!data || typeof data !== "object") return null;
	const record = data as { requests?: unknown; responses?: unknown };
	const list = Array.isArray(record.requests) ? record.requests : Array.isArray(record.responses) ? record.responses : null;
	if (!list) return null;
	return list.map((raw): BatchPart => {
		const item = (raw ?? {}) as Record<string, unknown>;
		const headers = Object.fromEntries(
			Object.entries((item.headers ?? {}) as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), String(v)]),
		);
		const body = item.body === undefined ? "" : typeof item.body === "string" ? item.body : JSON.stringify(item.body, null, 2);
		return {
			method: typeof item.method === "string" ? item.method.toUpperCase() : null,
			url: typeof item.url === "string" ? item.url : null,
			status: typeof item.status === "number" ? item.status : null,
			statusText: null,
			headers,
			body,
			group: typeof item.atomicityGroup === "string" ? item.atomicityGroup : null,
			id: item.id === undefined ? null : String(item.id),
		};
	});
}

/** Parse a $batch body. Returns null when it isn't a recognisable batch. */
export function parseBatch(body: string, contentType?: string): BatchPart[] | null {
	if (!body) return null;
	if (/json/i.test(contentType ?? "") || /^\s*\{/.test(body)) return parseJsonBatch(body);
	const boundary = boundaryFrom(contentType, body);
	if (!boundary) return null;
	const parts = parseMultipart(body, boundary, null);
	return parts.length ? parts : null;
}
