import { formatBytes } from "../../format";
import type { Entry } from "../../har/entries";
import type { Finding, ResourceType, Severity } from "../../model";
import { bytesOf, maxOf, subjectFor, sum, type Rule } from "../context";

function severityFor(size: number, threshold: number): Severity {
	if (size >= threshold * 4) return "high";
	if (size >= threshold * 2) return "medium";
	return "low";
}

const FIX: Partial<Record<ResourceType, string>> = {
	script: "Split the bundle so each page loads only the code it needs, lazy-load the rest, and check for large dependencies that could be replaced.",
	style: "Remove unused CSS and split styles per route so each page loads only what it uses.",
	image: "Resize the image to the size it is displayed at and serve a modern format such as AVIF or WebP.",
	font: "Subset the font to the characters you use and serve it as WOFF2.",
	document: "Render less HTML up front: paginate long lists and move inline data or scripts into cacheable files.",
};

/** Responses over the configured size, grouped by endpoint. Sizes are decoded (uncompressed) bytes. */
export const largeResponseRule: Rule = ({ byEndpoint, settings }) => {
	const findings: Finding[] = [];
	for (const [key, group] of byEndpoint) {
		const first = group[0]!;
		if (first.type === "media") continue;
		const threshold = (first.type === "api" ? settings.largeApiKb : settings.largeAssetKb) * 1000;
		const large = group.filter((entry: Entry) => entry.contentSize >= threshold);
		if (!large.length) continue;

		const maxSize = maxOf(large.map((entry) => entry.contentSize));
		const total = sum(large.map((entry) => entry.contentSize));
		const odata = large.some((entry) => entry.odata);
		const apiFix = odata
			? "Use $select to return only the fields the page shows and $top with $skip (or server paging) for long lists. Avoid $expand on collections you don't display."
			: "Return only the fields the page shows and paginate long lists. If the payload is reference data, cache it instead of sending it on every load.";

		findings.push({
			id: `large-response:${key}`,
			rule: "large-response",
			severity: severityFor(maxSize, threshold),
			subject: subjectFor(large),
			title: large.length === 1 ? `returned ${formatBytes(maxSize)}` : `returned ${formatBytes(total / large.length)} on average across ${large.length} calls`,
			why:
				first.type === "api"
					? `Large API responses take longer to download and to parse, and usually mean the client receives much more than it shows. ${formatBytes(sum(large.map(bytesOf)))} came over the wire for these calls.`
					: `This file is ${formatBytes(maxSize)} before compression, above the ${formatBytes(threshold)} threshold. Large files delay rendering on slow connections and devices.`,
			fix: first.type === "api" ? apiFix : (FIX[first.type] ?? "Check whether the whole response is needed, and compress or split it."),
			requestIds: large.map((entry) => entry.id),
			impact: { ms: 0, bytes: sum(large.map(bytesOf)) },
			endpoint: key,
		});
	}
	return findings;
};
