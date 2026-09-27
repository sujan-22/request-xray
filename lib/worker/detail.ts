import { requestText, responseImageDataUrl, responseText } from "../har/body";
import type { Entry } from "../har/entries";
import { baseMime, isJsonMime, isTextMime } from "../har/headers";
import type { HarInitiator } from "../har/types";
import { parseBatch, type BatchPart } from "../odata/batch";
import { decodeQuery, type DecodedQuery } from "../odata/query";

/** Bodies above this are cut for display; the inspector says so. */
export const MAX_BODY_CHARS = 1_500_000;

export interface Body {
	text: string;
	mimeType: string;
	truncated: boolean;
	/** Full length in characters before truncation. */
	length: number;
	json: boolean;
}

export interface ODataDetail {
	query: DecodedQuery;
	batchRequest: BatchPart[] | null;
	batchResponse: BatchPart[] | null;
	context: string | null;
	count: number | null;
	items: number | null;
	nextLink: string | null;
}

export interface RequestDetail {
	id: number;
	requestHeaders: Array<{ name: string; value: string }>;
	responseHeaders: Array<{ name: string; value: string }>;
	queryParams: Array<{ name: string; value: string }>;
	requestCookies: string[];
	responseCookies: string[];
	requestBody: Body | null;
	responseBody: Body | null;
	/** data: URL for image responses. */
	image: string | null;
	/** Why there's no response body, when there isn't one. */
	bodyNote: string | null;
	odata: ODataDetail | null;
	serverIP: string | null;
	connection: string | null;
	initiatorStack: string[];
	redirectURL: string | null;
}

function makeBody(text: string, mimeType: string): Body {
	const truncated = text.length > MAX_BODY_CHARS;
	return {
		text: truncated ? text.slice(0, MAX_BODY_CHARS) : text,
		mimeType,
		truncated,
		length: text.length,
		json: isJsonMime(mimeType) || /^\s*[{[]/.test(text.slice(0, 64)),
	};
}

function stackLines(initiator: HarInitiator | undefined): string[] {
	const lines: string[] = [];
	if (!initiator) return lines;
	if (initiator.url) lines.push(`${initiator.type ?? "initiator"} ${initiator.url}${typeof initiator.lineNumber === "number" ? `:${initiator.lineNumber + 1}` : ""}`);
	let stack = initiator.stack;
	let depth = 0;
	while (stack && depth < 6) {
		for (const frame of stack.callFrames ?? []) {
			const where = frame.url ? `${frame.url}:${(frame.lineNumber ?? 0) + 1}:${(frame.columnNumber ?? 0) + 1}` : "(anonymous)";
			lines.push(`${frame.functionName || "(anonymous)"} @ ${where}`);
			if (lines.length > 40) return lines;
		}
		stack = stack.parent;
		depth++;
	}
	return lines;
}

function odataDetail(entry: Entry, requestBody: string | null, response: string | null): ODataDetail {
	const url = new URL(entry.url);
	const isBatch = /\/\$batch$/i.test(url.pathname);
	let context: string | null = null;
	let count: number | null = null;
	let items: number | null = null;
	let nextLink: string | null = null;
	if (response && isJsonMime(entry.mimeType)) {
		try {
			const data = JSON.parse(response) as Record<string, unknown>;
			context = typeof data["@odata.context"] === "string" ? data["@odata.context"] : null;
			const rawCount = data["@odata.count"] ?? data["odata.count"];
			count = typeof rawCount === "number" ? rawCount : typeof rawCount === "string" ? Number(rawCount) : null;
			items = Array.isArray(data.value) ? data.value.length : null;
			const next = data["@odata.nextLink"] ?? data["odata.nextLink"];
			nextLink = typeof next === "string" ? next : null;
		} catch {
			// not JSON
		}
	}
	return {
		query: decodeQuery(url),
		batchRequest: isBatch && requestBody ? parseBatch(requestBody, entry.reqHeaders["content-type"] ?? entry.raw.request?.postData?.mimeType) : null,
		batchResponse: isBatch && response ? parseBatch(response, entry.resHeaders["content-type"] ?? entry.mimeType) : null,
		context,
		count,
		items,
		nextLink,
	};
}

export function buildDetail(entry: Entry): RequestDetail {
	const raw = entry.raw;
	const request = raw.request ?? {};
	const response = raw.response ?? {};
	const reqText = requestText(raw);
	const resText = responseText(raw);
	const image = responseImageDataUrl(raw);
	const content = response.content ?? {};

	let bodyNote: string | null = null;
	if (resText === null && !image) {
		if (entry.status === 0) bodyNote = "The request failed, so there is no response body.";
		else if (entry.status === 204 || entry.status === 304 || entry.method === "HEAD") bodyNote = `A ${entry.status || entry.method} response has no body.`;
		else if (typeof content.text !== "string") bodyNote = "The body wasn't saved in this HAR. Export with “Save all as HAR with content” to include bodies.";
		else if (!isTextMime(content.mimeType)) bodyNote = `Binary content (${baseMime(content.mimeType) || "unknown type"}) isn't shown.`;
	}

	const params: Array<{ name: string; value: string }> = [];
	for (const [name, value] of new URL(entry.url).searchParams) params.push({ name, value });

	return {
		id: entry.id,
		requestHeaders: (request.headers ?? []).map((h) => ({ name: h.name ?? "", value: h.value ?? "" })),
		responseHeaders: (response.headers ?? []).map((h) => ({ name: h.name ?? "", value: h.value ?? "" })),
		queryParams: params,
		requestCookies: (request.cookies ?? []).map((c) => c.name ?? "").filter(Boolean),
		responseCookies: (response.cookies ?? []).map((c) => c.name ?? "").filter(Boolean),
		requestBody: reqText !== null ? makeBody(reqText, request.postData?.mimeType ?? entry.reqHeaders["content-type"] ?? "") : null,
		responseBody: resText !== null ? makeBody(resText, content.mimeType ?? entry.mimeType) : null,
		image,
		bodyNote,
		odata: entry.odata ? odataDetail(entry, reqText, resText) : null,
		serverIP: raw.serverIPAddress ?? null,
		connection: raw.connection ?? null,
		initiatorStack: stackLines(raw._initiator),
		redirectURL: response.redirectURL || null,
	};
}
