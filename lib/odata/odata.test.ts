import { describe, expect, it } from "vitest";
import { parseBatch } from "./batch";
import { explainFilter, formatFilter, linesToText, parseFilter, tokenize } from "./filter";
import { decodeQuery, parseExpand, parseOrderBy, splitTopLevel } from "./query";

describe("tokenize", () => {
	it("recognises literals", () => {
		const types = tokenize("'it''s' 42 3.5m 2026-01-05T10:00:00Z 550e8400-e29b-41d4-a716-446655440000 datetime'2020-01-01' Name").map(
			(t) => t.type,
		);
		expect(types).toEqual(["string", "number", "number", "date", "guid", "typed", "ident", "eof"]);
	});

	it("rejects unterminated strings", () => {
		expect(() => tokenize("Name eq 'abc")).toThrow(/Unterminated/);
	});
});

describe("parseFilter", () => {
	it("gives and higher precedence than or", () => {
		const ast = parseFilter("A eq 1 or B eq 2 and C eq 3");
		expect(ast).toMatchObject({ type: "binary", op: "or", right: { type: "binary", op: "and" } });
	});

	it("gives comparison higher precedence than and, arithmetic higher than comparison", () => {
		const ast = parseFilter("Price mul 2 gt 100 and Stock ge 1");
		expect(ast).toMatchObject({
			op: "and",
			left: { op: "gt", left: { op: "mul" } },
			right: { op: "ge" },
		});
	});

	it("parses functions, member paths, negative numbers and not", () => {
		const ast = parseFilter("not startswith(tolower(Address/City), 'ham') and Balance gt -5");
		expect(ast).toMatchObject({
			op: "and",
			left: { type: "unary", op: "not", operand: { type: "call", name: "startswith" } },
			right: { right: { type: "literal", raw: "-5" } },
		});
	});

	it("parses lambdas and in-lists", () => {
		expect(parseFilter("Lines/any(l: l/Quantity gt 5)")).toMatchObject({ type: "lambda", path: "Lines", fn: "any", variable: "l" });
		expect(parseFilter("Tags/any()")).toMatchObject({ type: "lambda", body: null });
		expect(parseFilter("Id in (1, 2, 3)")).toMatchObject({ op: "in", right: { type: "list", items: [{}, {}, {}] } });
	});

	it("reports syntax errors with a position", () => {
		expect(() => parseFilter("Price gt")).toThrow(/ends too early/);
		expect(() => parseFilter("(Price gt 5")).toThrow(/Expected “\)”/);
		expect(() => parseFilter("Price gt 5 5")).toThrow(/Unexpected/);
	});
});

describe("formatFilter", () => {
	it("keeps short expressions on one line", () => {
		expect(linesToText(formatFilter(parseFilter("Price gt 100")))).toBe("Price gt 100");
	});

	it("breaks long and/or chains and indents groups", () => {
		const text = linesToText(
			formatFilter(
				parseFilter(
					"ProductCategory eq 'Footwear' and ListPrice ge 50 and (Color eq 'Red' or Color eq 'Blue' or Color eq 'Charcoal Grey') and IsDiscontinued eq false",
				),
			),
		);
		expect(text).toBe(
			[
				"ProductCategory eq 'Footwear'",
				"and ListPrice ge 50",
				"and (",
				"  Color eq 'Red'",
				"  or Color eq 'Blue'",
				"  or Color eq 'Charcoal Grey'",
				")",
				"and IsDiscontinued eq false",
			].join("\n"),
		);
	});
});

describe("explainFilter", () => {
	it("reads comparisons and functions in plain English", () => {
		expect(explainFilter(parseFilter("Price gt 100 and contains(Name, 'boot')"))).toBe("Price is greater than 100 and Name contains 'boot'");
		expect(explainFilter(parseFilter("DeletedOn eq null"))).toBe("DeletedOn is empty");
		expect(explainFilter(parseFilter("Id in ('a','b')"))).toBe("Id is one of ('a', 'b')");
	});

	it("keeps or-groups inside and unambiguous", () => {
		expect(explainFilter(parseFilter("A eq 1 and (B eq 2 or C eq 3)"))).toBe("A is 1 and (B is 2 or C is 3)");
	});

	it("reads lambdas", () => {
		expect(explainFilter(parseFilter("Lines/any(l: l/Quantity ge 2)"))).toBe("any Lines where l/Quantity is at least 2");
		expect(explainFilter(parseFilter("Lines/all(l: l/Shipped eq true)"))).toBe("every Lines where l/Shipped is true");
	});
});

describe("query options", () => {
	it("splits at the top level only", () => {
		expect(splitTopLevel("A,B($select=X,Y),'c,d'", ",")).toEqual(["A", "B($select=X,Y)", "'c,d'"]);
	});

	it("parses nested $expand with options", () => {
		const items = parseExpand("Customer($select=Name,Email),Lines($filter=Qty gt 1;$expand=Product($select=Sku);$top=5)");
		expect(items).toEqual([
			{ path: "Customer", select: ["Name", "Email"], expand: [], options: [] },
			{
				path: "Lines",
				select: [],
				expand: [{ path: "Product", select: ["Sku"], expand: [], options: [] }],
				options: [
					{ name: "$filter", value: "Qty gt 1" },
					{ name: "$top", value: "5" },
				],
			},
		]);
	});

	it("parses $orderby directions", () => {
		expect(parseOrderBy("Price desc, Name")).toEqual([
			{ expression: "Price", direction: "desc" },
			{ expression: "Name", direction: "asc" },
		]);
	});

	it("decodes a full OData URL", () => {
		const url = new URL(
			"https://api.test/odata/Customers('C-10')/Orders?$filter=Total%20gt%20100&$select=Id,Total&$orderby=Placed%20desc&$top=20&$skip=40&$count=true&api-version=7.3",
		);
		const query = decodeQuery(url);
		expect(query.segments).toEqual([
			{ name: "odata", key: null },
			{ name: "Customers", key: "'C-10'" },
			{ name: "Orders", key: null },
		]);
		expect(query.filter?.english).toBe("Total is greater than 100");
		expect(query.select).toEqual(["Id", "Total"]);
		expect(query.orderby).toEqual([{ expression: "Placed", direction: "desc" }]);
		expect(query.top).toBe(20);
		expect(query.skip).toBe(40);
		expect(query.count).toBe(true);
		expect(query.paging).toBe("Page 3 · items 41 to 60");
		expect(query.custom).toEqual([{ name: "api-version", value: "7.3" }]);
	});

	it("keeps an unparseable filter raw with an error", () => {
		const query = decodeQuery(new URL("https://api.test/odata/P?$filter=Price%20gt"));
		expect(query.filter?.lines).toBeNull();
		expect(query.filter?.error).toMatch(/ends too early/);
		expect(query.filter?.raw).toBe("Price gt");
	});
});

describe("parseBatch", () => {
	it("parses a multipart batch with a changeset", () => {
		const body = [
			"--batch_1",
			"Content-Type: application/http",
			"Content-Transfer-Encoding: binary",
			"",
			"GET Products(1) HTTP/1.1",
			"Accept: application/json",
			"",
			"",
			"--batch_1",
			"Content-Type: multipart/mixed; boundary=changeset_9",
			"",
			"--changeset_9",
			"Content-Type: application/http",
			"Content-ID: 1",
			"",
			"POST Carts HTTP/1.1",
			"Content-Type: application/json",
			"",
			'{"Id":"c1"}',
			"--changeset_9--",
			"--batch_1--",
		].join("\r\n");
		const parts = parseBatch(body, "multipart/mixed; boundary=batch_1");
		expect(parts).toHaveLength(2);
		expect(parts![0]).toMatchObject({ method: "GET", url: "Products(1)", headers: { accept: "application/json" }, group: null });
		expect(parts![1]).toMatchObject({ method: "POST", url: "Carts", body: '{"Id":"c1"}', group: "changeset_9", id: "1" });
	});

	it("parses batch responses", () => {
		const body = ["--resp", "Content-Type: application/http", "", "HTTP/1.1 404 Not Found", "Content-Type: application/json", "", '{"error":{}}', "--resp--"].join("\n");
		const parts = parseBatch(body, "multipart/mixed; boundary=resp");
		expect(parts![0]).toMatchObject({ status: 404, statusText: "Not Found", body: '{"error":{}}' });
	});

	it("parses JSON batches", () => {
		const body = JSON.stringify({
			requests: [
				{ id: "1", method: "get", url: "Products(1)" },
				{ id: "2", method: "POST", url: "Carts", atomicityGroup: "g1", body: { Id: "c1" }, headers: { "Content-Type": "application/json" } },
			],
		});
		const parts = parseBatch(body, "application/json");
		expect(parts).toHaveLength(2);
		expect(parts![0]).toMatchObject({ method: "GET", url: "Products(1)", id: "1" });
		expect(parts![1]).toMatchObject({ group: "g1", headers: { "content-type": "application/json" } });
		expect(parts![1]!.body).toContain('"Id": "c1"');
	});

	it("returns null for bodies that aren't batches", () => {
		expect(parseBatch("", "")).toBeNull();
		expect(parseBatch('{"a":1}', "application/json")).toBeNull();
		expect(parseBatch("plain text", "text/plain")).toBeNull();
	});
});
