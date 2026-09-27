import { describe, expect, it } from "vitest";
import { displayName, endpointKey, normalizePath, normalizeSegment, queryKeys, siteOf } from "./endpoint";

describe("normalizeSegment", () => {
	it.each([
		["123", "{n}"],
		["550e8400-e29b-41d4-a716-446655440000", "{guid}"],
		["2026-01-05", "{date}"],
		["5f3a9c1b2e7d", "{hash}"],
		["01HZX3K8Q9V2M7N4P6R8T0W1Y3", "{id}"],
		["someone@example.com", "{id}"],
		["Products(68719478279)", "Products({key})"],
		["Carts('abc-123')", "Carts({key})"],
		["OrderLines(OrderId=1,Line=2)", "OrderLines({key})"],
		["main.3f9a2c1b.js", "main.{hash}.js"],
		["red-shoe-12345", "red-shoe-{n}"],
	])("normalizes %s → %s", (input, expected) => {
		expect(normalizeSegment(input)).toBe(expected);
	});

	it.each(["products", "api", "v2", "Commerce", "GetProducts()", "api-v2", "styles.css", "Products"])("keeps %s", (input) => {
		expect(normalizeSegment(input)).toBe(input);
	});

	it("decodes percent-encoding before matching", () => {
		expect(normalizeSegment("Carts(%27abc%27)")).toBe("Carts({key})");
	});
});

describe("normalizePath", () => {
	it("normalizes each segment", () => {
		expect(normalizePath("/api/users/42/orders/7")).toBe("/api/users/{n}/orders/{n}");
		expect(normalizePath("/Commerce/Products(68719478279)/GetPrice")).toBe("/Commerce/Products({key})/GetPrice");
		expect(normalizePath("/")).toBe("/");
	});
});

describe("queryKeys", () => {
	it("returns sorted, unique, decoded keys", () => {
		expect(queryKeys("?b=2&a=1&b=3")).toEqual(["a", "b"]);
		expect(queryKeys("?%24filter=x&%24top=5")).toEqual(["$filter", "$top"]);
		expect(queryKeys("")).toEqual([]);
		expect(queryKeys("?")).toEqual([]);
	});
});

describe("endpointKey", () => {
	it("groups URLs that differ only by id and query values", () => {
		const a = endpointKey("GET", new URL("https://api.test/v1/products/1?page=1&size=20"));
		const b = endpointKey("GET", new URL("https://api.test/v1/products/2?size=50&page=3"));
		expect(a).toBe(b);
		expect(a).toBe("GET api.test/v1/products/{n}?page&size");
	});

	it("keeps methods and hosts apart", () => {
		const url = new URL("https://api.test/v1/cart");
		expect(endpointKey("GET", url)).not.toBe(endpointKey("POST", url));
		expect(endpointKey("GET", url)).not.toBe(endpointKey("GET", new URL("https://cdn.test/v1/cart")));
	});
});

describe("siteOf", () => {
	it.each([
		["shop.example.com", "example.com"],
		["api.shop.example.com", "example.com"],
		["www.example.co.uk", "example.co.uk"],
		["localhost:3000", "localhost"],
		["127.0.0.1", "127.0.0.1"],
	])("%s → %s", (host, site) => {
		expect(siteOf(host)).toBe(site);
	});
});

describe("displayName", () => {
	it("uses the last path segment or the host", () => {
		expect(displayName(new URL("https://a.test/js/app.js?v=1"))).toBe("app.js");
		expect(displayName(new URL("https://a.test/"))).toBe("a.test");
		expect(displayName(new URL("https://a.test/Carts('x')"))).toBe("Carts('x')");
	});
});
