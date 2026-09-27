import { describe, expect, it } from "vitest";
import { REDACTED, Redactor } from "./redact";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("Redactor", () => {
	it("removes auth headers and cookies but keeps ordinary headers", () => {
		const r = new Redactor();
		expect(r.header("Authorization", "Bearer abc.def.ghi")).toBe(REDACTED);
		expect(r.header("Cookie", "session=1")).toBe(REDACTED);
		expect(r.header("set-cookie", "a=1")).toBe(REDACTED);
		expect(r.header("X-Api-Key", "k")).toBe(REDACTED);
		expect(r.header("x-csrf-token", "t")).toBe(REDACTED);
		expect(r.header("Ocp-Apim-Subscription-Key", "k")).toBe(REDACTED);
		expect(r.header("content-type", "application/json")).toBe("application/json");
		expect(r.header("Access-Control-Allow-Credentials", "true")).toBe("true");
		expect(r.stats).toMatchObject({ headers: 4, cookies: 2 });
	});

	it("finds tokens inside free text", () => {
		const r = new Redactor();
		expect(r.text(`token ${JWT} here`)).toBe("token [redacted:jwt] here");
		expect(r.text("Basic dXNlcjpwYXNzd29yZA==")).toBe(`Basic ${REDACTED}`);
		expect(r.stats.tokens).toBe(2);
	});

	it("removes emails unless turned off", () => {
		expect(new Redactor().text("from ada@example.com")).toBe("from [redacted:email]");
		expect(new Redactor({ emails: false }).text("from ada@example.com")).toBe("from ada@example.com");
	});

	it("removes card numbers that pass the Luhn check only", () => {
		const r = new Redactor();
		expect(r.text("card 4111 1111 1111 1111 ok")).toBe("card [redacted:card] ok");
		expect(r.text("order 1234567890123")).toBe("order 1234567890123");
	});

	it("redacts sensitive query params, credentials and fragments in URLs", () => {
		const r = new Redactor();
		const out = r.url("https://user:pw@api.test/cb?code=abc&page=2&access_token=xyz#id_token=secret&state=1");
		const url = new URL(out);
		expect(url.username).toBe("");
		expect(url.searchParams.get("code")).toBe(REDACTED);
		expect(url.searchParams.get("access_token")).toBe(REDACTED);
		expect(url.searchParams.get("page")).toBe("2");
		expect(out).not.toContain("secret");
		expect(out).not.toContain("xyz");
	});

	it("redacts emails in URL paths without mangling OData keys", () => {
		const r = new Redactor();
		expect(r.url("https://api.test/Customers('ada@example.com')/Orders")).toBe("https://api.test/Customers('[redacted:email]')/Orders");
		expect(r.url("https://api.test/Products(42)?$select=Id")).toBe("https://api.test/Products(42)?$select=Id");
	});

	it("blanks sensitive JSON fields at any depth", () => {
		const r = new Redactor();
		const body = r.body(JSON.stringify({ user: { email: "a@b.co", password: "hunter2", profile: { apiKey: "k1" } }, items: [{ token: "t" }] }));
		expect(JSON.parse(body)).toEqual({
			user: { email: "[redacted:email]", password: REDACTED, profile: { apiKey: REDACTED } },
			items: [{ token: REDACTED }],
		});
	});

	it("handles form-encoded bodies", () => {
		const r = new Redactor();
		expect(r.body("username=ada&password=hunter2", "application/x-www-form-urlencoded")).toBe(`username=ada&password=${encodeURIComponent(REDACTED)}`);
	});
});
