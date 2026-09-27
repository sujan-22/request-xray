import { formatBytes } from "../../format";
import type { Entry } from "../../har/entries";
import { isJsonMime } from "../../har/headers";
import type { Finding, Severity } from "../../model";
import { bytesOf, subjectFor, sum, type Rule } from "../context";

/** Items with at least this many properties, returned without $select, count as over-fetching. */
export const OVERFETCH_MIN_FIELDS = 15;
/** Ignore small responses: trimming them won't be noticed. */
export const OVERFETCH_MIN_BYTES = 10_000;

/** Average number of non-annotation properties per returned entity, or 0 when it isn't OData JSON. */
export function fieldsPerItem(body: string): number {
	let data: unknown;
	try {
		data = JSON.parse(body);
	} catch {
		return 0;
	}
	if (!data || typeof data !== "object") return 0;
	const record = data as Record<string, unknown>;
	const items = Array.isArray(record.value) ? record.value.slice(0, 20) : [record];
	const objects = items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
	if (!objects.length) return 0;
	const counts = objects.map((item) => Object.keys(item).filter((key) => !key.includes("@")).length);
	return Math.round(sum(counts) / counts.length);
}

function hasSelect(entry: Entry): boolean {
	return /[?&]\$select=/i.test(decodeURIComponentSafe(entry.search));
}

function decodeURIComponentSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function severityFor(bytes: number): Severity {
	return bytes >= 250_000 ? "medium" : "low";
}

/** OData reads returning every property because the query has no $select. */
export const odataOverfetchRule: Rule = (ctx) => {
	const findings: Finding[] = [];
	for (const [key, group] of ctx.byEndpoint) {
		const candidates = group.filter(
			(entry) =>
				entry.odata &&
				entry.method === "GET" &&
				entry.status >= 200 &&
				entry.status < 300 &&
				entry.contentSize >= OVERFETCH_MIN_BYTES &&
				isJsonMime(entry.mimeType) &&
				!hasSelect(entry) &&
				!/\/\$(metadata|batch)$/i.test(entry.path),
		);
		if (!candidates.length) continue;

		let fields = 0;
		const flagged: Entry[] = [];
		for (const entry of candidates) {
			const body = ctx.body(entry);
			if (!body) continue;
			const count = fieldsPerItem(body);
			if (count >= OVERFETCH_MIN_FIELDS) {
				flagged.push(entry);
				fields = Math.max(fields, count);
			}
		}
		if (!flagged.length) continue;

		const first = flagged[0]!;
		const bytes = sum(flagged.map(bytesOf));
		findings.push({
			id: `odata-overfetch:${key}`,
			rule: "odata-overfetch",
			severity: severityFor(sum(flagged.map((entry) => entry.contentSize))),
			subject: subjectFor(flagged),
			title: `returned ${fields} fields per item without $select`,
			why: `Without $select, an OData service returns every property of every entity, and pages usually show a handful. ${flagged.length === 1 ? "This response was" : `These ${flagged.length} responses were`} ${formatBytes(sum(flagged.map((entry) => entry.contentSize)))} before compression.`,
			fix: `Add $select with only the fields the page uses, for example ${first.search ? "&" : "?"}$select=Id,Name,Price. Keep $expand to the related data you display, and give it its own $select too.`,
			requestIds: flagged.map((entry) => entry.id),
			impact: { ms: 0, bytes },
			endpoint: key,
		});
	}
	return findings;
};
