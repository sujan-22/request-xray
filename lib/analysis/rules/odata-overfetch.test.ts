import { describe, expect, it } from "vitest";
import { api } from "../../testing/har-builder";
import { runRule } from "../../testing/run-rule";
import { fieldsPerItem, odataOverfetchRule } from "./odata-overfetch";

function entity(fields: number, id: number) {
	const item: Record<string, unknown> = { "@odata.etag": 'W/"1"', Id: id };
	for (let i = 1; i < fields; i++) item[`Field${i}`] = `value ${i} for item ${id}`;
	return item;
}

function collection(fields: number, items: number) {
	return JSON.stringify({
		"@odata.context": "https://api.test/odata/$metadata#Products",
		value: Array.from({ length: items }, (_, i) => entity(fields, i)),
	});
}

describe("fieldsPerItem", () => {
	it("counts properties per entity and skips annotations", () => {
		expect(fieldsPerItem(collection(30, 5))).toBe(30);
		expect(fieldsPerItem(JSON.stringify(entity(12, 1)))).toBe(12);
		expect(fieldsPerItem("not json")).toBe(0);
		expect(fieldsPerItem('{"value": [1, 2]}')).toBe(0);
	});
});

describe("OData over-fetch rule", () => {
	it("flags OData reads with many fields and no $select", () => {
		const body = collection(40, 50);
		const findings = runRule(odataOverfetchRule, [
			api("https://api.test/odata/Products?$top=50", 0, 200, { response: body, size: body.length }),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.title).toBe("returned 40 fields per item without $select");
		expect(findings[0]!.fix).toContain("&$select=");
	});

	it("leaves queries with $select alone", () => {
		const body = collection(40, 50);
		const findings = runRule(odataOverfetchRule, [
			api("https://api.test/odata/Products?$top=50&$select=Id,Name", 0, 200, { response: body, size: body.length }),
		]);
		expect(findings).toHaveLength(0);
	});

	it("ignores narrow or small responses and non-OData APIs", () => {
		const narrow = collection(6, 200);
		const small = collection(40, 1);
		const wide = collection(40, 50);
		const findings = runRule(odataOverfetchRule, [
			api("https://api.test/odata/Narrow?$top=200", 0, 100, { response: narrow, size: narrow.length }),
			api("https://api.test/odata/Small?$top=1", 0, 100, { response: small, size: small.length }),
			api("https://api.test/rest/products", 0, 100, { response: wide, size: wide.length }),
		]);
		expect(findings).toHaveLength(0);
	});
});
