/**
 * The analysed report. Everything here is plain, structured-cloneable data:
 * it crosses the worker boundary as-is, and it is what exports are built from.
 * Bodies and full headers stay in the worker and are fetched on demand.
 */

export type ResourceType = "document" | "api" | "script" | "style" | "image" | "font" | "media" | "other";

export const RESOURCE_TYPES: readonly ResourceType[] = [
	"document",
	"api",
	"script",
	"style",
	"image",
	"font",
	"media",
	"other",
];

export interface Timings {
	blocked: number;
	dns: number;
	/** Connection setup, excluding TLS (HAR counts TLS inside connect; we split it out). */
	connect: number;
	ssl: number;
	send: number;
	/** Time to first byte after the request was sent. */
	wait: number;
	receive: number;
}

export interface RequestRecord {
	id: number;
	method: string;
	url: string;
	host: string;
	path: string;
	search: string;
	/** Short display name: last path segment, or the host for "/". */
	name: string;
	/** Grouping key: method + host + normalized path + sorted query keys. */
	endpoint: string;
	status: number;
	statusText: string;
	failed: boolean;
	error: string | null;
	type: ResourceType;
	mimeType: string;
	/** Milliseconds since the first request (or page) started. */
	start: number;
	duration: number;
	end: number;
	timings: Timings;
	/** Bytes on the wire, when the browser recorded them. -1 when unknown. */
	transferSize: number;
	/** Decoded body size. */
	contentSize: number;
	requestBodySize: number;
	encoding: string | null;
	fromCache: "memory" | "disk" | null;
	protocol: string;
	priority: string | null;
	initiator: string | null;
	pageIndex: number;
	firstParty: boolean;
	odata: boolean;
}

export interface PageInfo {
	id: string;
	title: string;
	start: number;
	onContentLoad: number | null;
	onLoad: number | null;
}

export interface EndpointStat {
	key: string;
	method: string;
	host: string;
	/** Normalized path plus query keys, e.g. /api/products/{id}?page&size */
	pattern: string;
	type: ResourceType;
	calls: number;
	/** Distinct URL + body combinations among the calls. */
	variants: number;
	requestIds: number[];
	totalTime: number;
	avgTime: number;
	maxTime: number;
	totalTransfer: number;
	totalContent: number;
	errors: number;
	firstStart: number;
	odata: boolean;
}

export type Severity = "high" | "medium" | "low";

export const SEVERITIES: readonly Severity[] = ["high", "medium", "low"];

export type RuleId =
	| "duplicate"
	| "chatty"
	| "sequential"
	| "slow"
	| "large-response"
	| "no-compression"
	| "no-cache"
	| "errors"
	| "odata-overfetch";

export interface Finding {
	id: string;
	rule: RuleId;
	severity: Severity;
	/** The code-like part, rendered in mono: an endpoint, a host, a file. */
	subject: string;
	/** Plain sentence completing the subject, e.g. "ran 4 times with the same body". */
	title: string;
	/** Why it matters, in plain language. */
	why: string;
	/** What to do about it. */
	fix: string;
	requestIds: number[];
	/** Ordered request ids for sequential chains. */
	chain?: number[];
	/** Estimated time and bytes that could be saved. 0 when not applicable. */
	impact: { ms: number; bytes: number };
	endpoint?: string;
}

export interface Settings {
	/** A request slower than this is flagged. */
	slowMs: number;
	/** API (fetch/XHR) responses larger than this are flagged. */
	largeApiKb: number;
	/** Other responses (scripts, images, documents) larger than this are flagged. */
	largeAssetKb: number;
	/** Max idle gap between one call ending and the next starting to count as a chain. */
	chainGapMs: number;
	/** Minimum number of calls in a sequential chain. */
	chainMinLength: number;
	/** Calls to one endpoint with different parameters before it counts as chatty. */
	chattyMinCalls: number;
}

export const DEFAULT_SETTINGS: Settings = {
	slowMs: 1000,
	largeApiKb: 250,
	largeAssetKb: 1000,
	chainGapMs: 50,
	chainMinLength: 3,
	chattyMinCalls: 5,
};

export interface Summary {
	requests: number;
	transferred: number;
	contentSize: number;
	/** End of the last response. */
	duration: number;
	onContentLoad: number | null;
	onLoad: number | null;
	hosts: number;
	primaryHost: string;
	endpoints: number;
	apiCalls: number;
	errors: number;
	cached: number;
	bySeverity: Record<Severity, number>;
	byType: Record<ResourceType, { count: number; bytes: number }>;
	/** Estimated total time that the findings could save, not additive across rules. */
	savingsMs: number;
	savingsBytes: number;
}

export interface ReportMeta {
	fileName: string;
	fileSize: number;
	creator: string;
	browser: string;
	harVersion: string;
	/** Entries dropped because they had no usable URL. */
	skipped: number;
	warnings: string[];
	parseMs: number;
	analyzeMs: number;
}

export interface Report {
	meta: ReportMeta;
	pages: PageInfo[];
	summary: Summary;
	requests: RequestRecord[];
	endpoints: EndpointStat[];
	findings: Finding[];
	settings: Settings;
}
