import { describe, expect, it } from "vitest";
import { analyze } from "../analysis/analyze";
import { api, makeHar } from "../testing/har-builder";
import { buildHtmlReport } from "./html-report";
import { buildJsonReport } from "./json-report";
import { sanitizeHar } from "./sanitize-har";

const SECRETS = {
	jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQtdXNlciJ9.c2lnbmF0dXJlLXNlY3JldA",
	cookie: "sessionid=COOKIE-SECRET-123",
	apiKey: "APIKEY-SECRET-456",
	param: "PARAM-SECRET-789",
	email: "ada.lovelace@example.com",
	password: "PASSWORD-SECRET",
};

function secretHar() {
	const har = makeHar([
		api(`https://api.shop.test/Customers('${SECRETS.email}')?access_token=${SECRETS.param}&$select=Id`, 0, 120, {
			reqHeaders: { authorization: `Bearer ${SECRETS.jwt}`, cookie: SECRETS.cookie, "x-api-key": SECRETS.apiKey, accept: "application/json" },
			resHeaders: { "set-cookie": `${SECRETS.cookie}; HttpOnly`, "content-encoding": "br" },
			response: JSON.stringify({ Email: SECRETS.email, Token: SECRETS.jwt }),
		}),
		api("https://api.shop.test/login", 150, 200, {
			method: "POST",
			body: JSON.stringify({ username: "ada", password: SECRETS.password }),
		}),
	]);
	har.log.entries![0]!.request!.cookies = [{ name: "sessionid", value: "COOKIE-SECRET-123" }];
	return har;
}

function expectClean(text: string) {
	for (const [name, secret] of Object.entries(SECRETS)) {
		expect(text, `${name} leaked`).not.toContain(secret);
	}
}

describe("exports", () => {
	it("sanitized HAR contains no secrets and drops response bodies by default", () => {
		const { har, redactor } = sanitizeHar(secretHar(), { emails: true, responseBodies: false });
		const text = JSON.stringify(har);
		expectClean(text);
		expect(har.log.entries![0]!.response!.content!.text).toBeUndefined();
		expect(har.log.entries![0]!.request!.cookies).toEqual([]);
		expect(redactor.stats.cookies).toBeGreaterThan(0);
		// Still a valid HAR the tool can read back.
		const reread = analyze(har);
		expect(reread.report.requests).toHaveLength(2);
	});

	it("sanitized HAR can keep response bodies, redacted", () => {
		const { har } = sanitizeHar(secretHar(), { emails: true, responseBodies: true });
		expectClean(JSON.stringify(har));
		expect(har.log.entries![0]!.response!.content!.text).toContain("[redacted:email]");
	});

	it("JSON report contains no secrets, even with headers included", () => {
		const { report, prepared } = analyze(secretHar(), { fileName: "capture.har" });
		const json = buildJsonReport(report, prepared.entries, { emails: true, headers: true });
		expectClean(JSON.stringify(json));
		expect(json.requests[0]!.requestHeaders!.accept).toBe("application/json");
		expect(json.redaction!.headers).toBeGreaterThan(0);
	});

	it("HTML report contains no secrets and no scripts", () => {
		const { report, prepared } = analyze(secretHar(), { fileName: "capture.har" });
		const html = buildHtmlReport(report, prepared.entries, { emails: true, headers: false });
		expectClean(html);
		expect(html).not.toMatch(/<script/i);
		expect(html).toContain("<svg");
		expect(html).toMatch(/^<!doctype html>/);
	});
});
