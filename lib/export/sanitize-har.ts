import { isTextMime } from "../har/headers";
import type { Har, HarEntry, HarInitiator, HarNameValue } from "../har/types";
import { Redactor } from "../redact/redact";

export interface SanitizeOptions {
	emails: boolean;
	/** Keep response bodies (redacted). Off by default: bodies are where customer data lives. */
	responseBodies: boolean;
}

function headers(list: HarNameValue[] | undefined, redactor: Redactor): HarNameValue[] {
	return (list ?? []).map((h) => ({ name: h.name ?? "", value: redactor.header(h.name ?? "", h.value ?? "") }));
}

function initiator(value: HarInitiator | undefined, redactor: Redactor): HarInitiator | undefined {
	if (!value) return undefined;
	const stack = (s: HarInitiator["stack"]): HarInitiator["stack"] =>
		s && {
			callFrames: s.callFrames?.map((frame) => ({ ...frame, url: frame.url ? redactor.url(frame.url) : frame.url })),
			parent: stack(s.parent),
		};
	return { ...value, url: value.url ? redactor.url(value.url) : value.url, stack: stack(value.stack) };
}

function sanitizeEntry(entry: HarEntry, redactor: Redactor, options: SanitizeOptions): HarEntry {
	const request = entry.request ?? {};
	const response = entry.response ?? {};
	const content = response.content ?? {};
	redactor.stats.cookies += (request.cookies?.length ?? 0) + (response.cookies?.length ?? 0);

	const keepBody = options.responseBodies && typeof content.text === "string" && isTextMime(content.mimeType) && content.encoding !== "base64";
	const { text: _text, encoding: _encoding, ...contentRest } = content;

	return {
		...entry,
		request: {
			...request,
			url: redactor.url(request.url ?? ""),
			headers: headers(request.headers, redactor),
			cookies: [],
			queryString: (request.queryString ?? []).map((q) => ({ name: q.name ?? "", value: redactor.param(q.name ?? "", q.value ?? "") })),
			...(request.postData
				? {
						postData: {
							mimeType: request.postData.mimeType,
							...(typeof request.postData.text === "string" ? { text: redactor.body(request.postData.text, request.postData.mimeType) } : {}),
							...(request.postData.params
								? { params: request.postData.params.map((p) => ({ name: p.name, value: redactor.param(p.name ?? "", p.value ?? "") })) }
								: {}),
						},
					}
				: {}),
		},
		response: {
			...response,
			headers: headers(response.headers, redactor),
			cookies: [],
			redirectURL: response.redirectURL ? redactor.url(response.redirectURL) : response.redirectURL,
			content: keepBody ? { ...contentRest, text: redactor.body(content.text!, content.mimeType) } : contentRest,
		},
		...(entry._initiator ? { _initiator: initiator(entry._initiator, redactor) } : {}),
	};
}

/** A HAR safe to attach to a ticket: no auth headers, cookies, tokens, and (by default) no response bodies. */
export function sanitizeHar(har: Har, options: SanitizeOptions): { har: Har; redactor: Redactor } {
	const redactor = new Redactor({ emails: options.emails });
	const log = har.log;
	return {
		har: {
			log: {
				...log,
				pages: log.pages?.map((page) => ({ ...page, title: page.title ? redactor.url(page.title) : page.title })),
				entries: (log.entries ?? []).map((entry) => sanitizeEntry(entry, redactor, options)),
				comment: "Sanitized by Request X-ray: auth headers, cookies, tokens and secrets removed.",
			} as Har["log"],
		},
		redactor,
	};
}
