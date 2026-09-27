import type { RuleId } from "../model";

/** Labels and one-line descriptions for each rule, shared by the UI, the docs section and exports. */
export const RULE_INFO: Record<RuleId, { label: string; code: string; checks: string }> = {
	duplicate: {
		label: "Duplicate calls",
		code: "DUP",
		checks: "The same method, URL and body requested more than once.",
	},
	chatty: {
		label: "Chatty endpoint",
		code: "N+1",
		checks: "One API endpoint called many times with different ids, where one batched call would do.",
	},
	sequential: {
		label: "Sequential chain",
		code: "SEQ",
		checks: "API calls that ran one after another when they could run in parallel.",
	},
	slow: {
		label: "Slow request",
		code: "SLOW",
		checks: "Requests over the time threshold, with the phase that took longest.",
	},
	"large-response": {
		label: "Large response",
		code: "SIZE",
		checks: "Responses over the size threshold (API calls and other files have separate limits).",
	},
	"no-compression": {
		label: "No compression",
		code: "GZIP",
		checks: "Text responses (JSON, JS, CSS, HTML) sent without gzip or Brotli.",
	},
	"no-cache": {
		label: "No cache headers",
		code: "CACHE",
		checks: "Static files without Cache-Control or Expires.",
	},
	errors: {
		label: "Errors",
		code: "ERR",
		checks: "4xx and 5xx responses, and requests that failed or were cancelled.",
	},
	"odata-overfetch": {
		label: "OData over-fetch",
		code: "$SEL",
		checks: "OData reads that return every field because the query has no $select.",
	},
};
