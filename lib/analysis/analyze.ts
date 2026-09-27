import { buildEntries, toRecord, type BuiltEntries, type Entry } from "../har/entries";
import type { Har } from "../har/types";
import {
	DEFAULT_SETTINGS,
	RESOURCE_TYPES,
	SEVERITIES,
	type EndpointStat,
	type Finding,
	type Report,
	type ResourceType,
	type Severity,
	type Settings,
	type Summary,
} from "../model";
import { createContext, maxOf, type Rule } from "./context";
import { buildEndpoints, groupByEndpoint } from "./endpoints";
import { chattyRule } from "./rules/chatty";
import { duplicateRule } from "./rules/duplicate";
import { errorsRule } from "./rules/errors";
import { largeResponseRule } from "./rules/large-response";
import { noCacheRule } from "./rules/no-cache";
import { noCompressionRule } from "./rules/no-compression";
import { odataOverfetchRule } from "./rules/odata-overfetch";
import { sequentialRule } from "./rules/sequential";
import { slowRule } from "./rules/slow";

export const RULES: readonly Rule[] = [
	duplicateRule,
	chattyRule,
	sequentialRule,
	slowRule,
	largeResponseRule,
	noCompressionRule,
	noCacheRule,
	errorsRule,
	odataOverfetchRule,
];

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function sortFindings(findings: Finding[]): Finding[] {
	return findings.sort(
		(a, b) =>
			SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
			b.impact.ms - a.impact.ms ||
			b.impact.bytes - a.impact.bytes ||
			b.requestIds.length - a.requestIds.length ||
			a.id.localeCompare(b.id),
	);
}

/** Parsed entries plus the groupings that don't depend on settings. */
export interface Prepared extends BuiltEntries {
	byEndpoint: Map<string, Entry[]>;
	endpoints: EndpointStat[];
}

export function prepare(har: Har): Prepared {
	const built = buildEntries(har);
	const byEndpoint = groupByEndpoint(built.entries);
	return { ...built, byEndpoint, endpoints: buildEndpoints(byEndpoint) };
}

export function runRules(prepared: Prepared, settings: Settings): Finding[] {
	const ctx = createContext(prepared.entries, prepared.byEndpoint, settings);
	return sortFindings(RULES.flatMap((rule) => rule(ctx)));
}

export function summarize(prepared: Prepared, findings: readonly Finding[]): Summary {
	const { entries, pages } = prepared;
	const byType = Object.fromEntries(RESOURCE_TYPES.map((type) => [type, { count: 0, bytes: 0 }])) as Record<
		ResourceType,
		{ count: number; bytes: number }
	>;
	const bySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<Severity, number>;
	const hosts = new Set<string>();
	let transferred = 0;
	let contentSize = 0;
	let apiCalls = 0;
	let errors = 0;
	let cached = 0;

	for (const entry of entries) {
		const bytes = Math.max(0, entry.transferSize);
		transferred += bytes;
		contentSize += entry.contentSize;
		hosts.add(entry.host);
		byType[entry.type].count++;
		byType[entry.type].bytes += bytes;
		if (entry.type === "api") apiCalls++;
		if (entry.failed || entry.status >= 400) errors++;
		if (entry.fromCache) cached++;
	}
	for (const finding of findings) bySeverity[finding.severity]++;

	// Time and bytes the waste-type findings account for. Rules can overlap, so this is an upper bound.
	const savingsMs = findings
		.filter((f) => f.rule === "duplicate" || f.rule === "sequential" || f.rule === "chatty")
		.reduce((total, f) => total + f.impact.ms, 0);
	const savingsBytes = findings
		.filter((f) => f.rule === "duplicate" || f.rule === "no-compression")
		.reduce((total, f) => total + f.impact.bytes, 0);

	const firstPage = pages[0];
	return {
		requests: entries.length,
		transferred,
		contentSize,
		duration: entries.length ? maxOf(entries.map((entry) => entry.end)) : 0,
		onContentLoad: firstPage?.onContentLoad ?? null,
		onLoad: firstPage?.onLoad ?? null,
		hosts: hosts.size,
		primaryHost: prepared.primaryHost,
		endpoints: prepared.byEndpoint.size,
		apiCalls,
		errors,
		cached,
		bySeverity,
		byType,
		savingsMs,
		savingsBytes,
	};
}

export interface AnalyzeOptions {
	fileName?: string;
	fileSize?: number;
	settings?: Partial<Settings>;
	parseMs?: number;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function buildReport(prepared: Prepared, har: Har, options: AnalyzeOptions & { prepareMs?: number }): Report {
	const settings: Settings = { ...DEFAULT_SETTINGS, ...options.settings };
	const started = now();
	const findings = runRules(prepared, settings);
	const summary = summarize(prepared, findings);
	const creator = har.log.creator;
	const browser = har.log.browser;
	return {
		meta: {
			fileName: options.fileName ?? "capture.har",
			fileSize: options.fileSize ?? 0,
			creator: creator?.name ? `${creator.name}${creator.version ? ` ${creator.version}` : ""}` : "",
			browser: browser?.name ? `${browser.name}${browser.version ? ` ${browser.version}` : ""}` : "",
			harVersion: har.log.version ?? "",
			skipped: prepared.skipped,
			warnings: prepared.warnings,
			parseMs: options.parseMs ?? 0,
			analyzeMs: Math.round((options.prepareMs ?? 0) + now() - started),
		},
		pages: prepared.pages,
		summary,
		requests: prepared.entries.map(toRecord),
		endpoints: prepared.endpoints,
		findings,
		settings,
	};
}

/** One-shot: HAR in, report out. The worker uses prepare + buildReport so it can re-run rules cheaply. */
export function analyze(har: Har, options: AnalyzeOptions = {}): { report: Report; prepared: Prepared } {
	const started = now();
	const prepared = prepare(har);
	const report = buildReport(prepared, har, { ...options, prepareMs: now() - started });
	return { report, prepared };
}
