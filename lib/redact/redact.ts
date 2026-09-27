/**
 * Redaction for anything that leaves the page: reports, JSON exports and
 * sanitized HAR files. Auth headers, cookies and tokens are always removed;
 * emails and card numbers are removed by default too.
 */

export interface RedactOptions {
	/** Replace email addresses in URLs, headers and bodies. */
	emails: boolean;
}

export interface RedactionStats {
	headers: number;
	cookies: number;
	params: number;
	tokens: number;
	emails: number;
	cards: number;
	fields: number;
}

export const REDACTED = "[redacted]";

const SENSITIVE_HEADER =
	/^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|apikey)$|token|secret|password|passwd|session|csrf|xsrf|signature|subscription-key|functions-key|credential|api[-_]?key|auth/i;

/** Headers that look sensitive by name but only describe the request. */
const SAFE_HEADER = /^(access-control-allow-credentials|access-control-allow-headers|access-control-request-headers|www-authenticate|authority)$/i;

const SENSITIVE_PARAM =
	/^(access_token|id_token|refresh_token|token|code|state|nonce|sig|signature|key|password|pwd|pass|secret|client_secret|session|sessionid|sid|auth|jwt|ticket|otp)$|token|secret|password|signature|session|api[-_]?key|credential/i;

const SENSITIVE_FIELD =
	/^(password|passwd|pwd|pin|cvv|cvc|cardnumber|card_number|ssn|sin|secret|client_secret)$|token|secret|password|api[-_]?key|credential|authorization/i;

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const BEARER = /\b(Bearer|Basic|Negotiate|Digest)\s+[A-Za-z0-9\-._~+/=]{8,}/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;

function luhn(digits: string): boolean {
	let total = 0;
	let double = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let d = digits.charCodeAt(i) - 48;
		if (double) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		total += d;
		double = !double;
	}
	return total % 10 === 0;
}

export class Redactor {
	readonly stats: RedactionStats = { headers: 0, cookies: 0, params: 0, tokens: 0, emails: 0, cards: 0, fields: 0 };
	constructor(private readonly options: RedactOptions = { emails: true }) {}

	isSensitiveHeader(name: string): boolean {
		return !SAFE_HEADER.test(name) && SENSITIVE_HEADER.test(name);
	}

	/** Free text: tokens, auth schemes, emails and card numbers anywhere in it. */
	text(value: string): string {
		let out = value.replace(JWT, () => {
			this.stats.tokens++;
			return "[redacted:jwt]";
		});
		out = out.replace(BEARER, (_match, scheme: string) => {
			this.stats.tokens++;
			return `${scheme} ${REDACTED}`;
		});
		if (this.options.emails) {
			out = out.replace(EMAIL, () => {
				this.stats.emails++;
				return "[redacted:email]";
			});
		}
		out = out.replace(CARD, (match) => {
			const digits = match.replace(/\D/g, "");
			if (digits.length < 13 || !luhn(digits)) return match;
			this.stats.cards++;
			return "[redacted:card]";
		});
		return out;
	}

	header(name: string, value: string): string {
		if (this.isSensitiveHeader(name)) {
			if (/cookie/i.test(name)) this.stats.cookies++;
			else this.stats.headers++;
			return REDACTED;
		}
		return this.text(value);
	}

	param(name: string, value: string): string {
		if (SENSITIVE_PARAM.test(name)) {
			this.stats.params++;
			return REDACTED;
		}
		return this.text(value);
	}

	url(value: string): string {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			return this.text(value);
		}
		if (url.username || url.password) {
			url.username = "";
			url.password = "";
			this.stats.tokens++;
		}
		if (url.search.length > 1) {
			// Rewrite only the pairs that change, so untouched params ($select, $filter) keep their original encoding.
			url.search = url.search
				.slice(1)
				.split("&")
				.map((pair) => {
					const eq = pair.indexOf("=");
					const rawName = eq === -1 ? pair : pair.slice(0, eq);
					const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
					const value = decodeSafe(rawValue.replace(/\+/g, " "));
					const next = this.param(decodeSafe(rawName.replace(/\+/g, " ")), value);
					return next === value ? pair : `${rawName}=${encodeURIComponent(next)}`;
				})
				.join("&");
		}
		if (url.hash) {
			// OAuth implicit flows put tokens in the fragment: #access_token=…&token_type=Bearer
			const fragment = url.hash.slice(1);
			if (fragment.includes("=")) {
				const next = new URLSearchParams();
				for (const [name, paramValue] of new URLSearchParams(fragment)) next.append(name, this.param(name, paramValue));
				url.hash = next.toString();
			} else {
				url.hash = this.text(fragment);
			}
		}
		// Paths can carry emails or tokens too. Only touch the path when something matched.
		const path = decodeSafe(url.pathname);
		const redactedPath = this.text(path);
		if (redactedPath !== path) url.pathname = redactedPath;
		return url.toString();
	}

	/** JSON values: sensitive keys are blanked, every string goes through text(). */
	json(value: unknown, key?: string): unknown {
		if (key && SENSITIVE_FIELD.test(key) && value !== null && typeof value !== "object") {
			this.stats.fields++;
			return REDACTED;
		}
		if (typeof value === "string") return this.text(value);
		if (Array.isArray(value)) return value.map((item) => this.json(item));
		if (value && typeof value === "object") {
			return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, this.json(v, k)]));
		}
		return value;
	}

	/** A body of unknown format: JSON if it parses, form-encoded if it looks like it, else text. */
	body(value: string, mimeType = ""): string {
		const trimmed = value.trim();
		if (/json/i.test(mimeType) || /^[{[]/.test(trimmed)) {
			try {
				return JSON.stringify(this.json(JSON.parse(trimmed)));
			} catch {
				// fall through to text
			}
		}
		if (/x-www-form-urlencoded/i.test(mimeType) || /^[\w.%-]+=[^&\s]*(&[\w.%-]+=[^&\s]*)*$/.test(trimmed)) {
			const params = new URLSearchParams(trimmed);
			const next = new URLSearchParams();
			for (const [name, paramValue] of params) next.append(name, this.param(name, paramValue));
			return next.toString();
		}
		return this.text(value);
	}

	total(): number {
		const s = this.stats;
		return s.headers + s.cookies + s.params + s.tokens + s.emails + s.cards + s.fields;
	}
}

function decodeSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
