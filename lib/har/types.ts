/**
 * HAR 1.2 (http://www.softwareishard.com/blog/har-12-spec/) plus the
 * underscore-prefixed extensions Chrome and Firefox add. Every field is
 * optional here on purpose: real exports are often incomplete, and the parser
 * fills in defaults rather than trusting the file.
 */

export interface HarNameValue {
	name?: string;
	value?: string;
}

export interface HarPostData {
	mimeType?: string;
	text?: string;
	params?: Array<HarNameValue & { fileName?: string; contentType?: string }>;
}

export interface HarRequest {
	method?: string;
	url?: string;
	httpVersion?: string;
	headers?: HarNameValue[];
	queryString?: HarNameValue[];
	cookies?: HarNameValue[];
	postData?: HarPostData;
	headersSize?: number;
	bodySize?: number;
}

export interface HarContent {
	size?: number;
	compression?: number;
	mimeType?: string;
	text?: string;
	encoding?: string;
}

export interface HarResponse {
	status?: number;
	statusText?: string;
	httpVersion?: string;
	headers?: HarNameValue[];
	cookies?: HarNameValue[];
	content?: HarContent;
	redirectURL?: string;
	headersSize?: number;
	bodySize?: number;
	/** Chrome: bytes on the wire, including headers. */
	_transferSize?: number;
	_error?: string | null;
}

export interface HarTimings {
	blocked?: number;
	dns?: number;
	connect?: number;
	ssl?: number;
	send?: number;
	wait?: number;
	receive?: number;
	_blocked_queueing?: number;
}

export interface HarInitiator {
	type?: string;
	url?: string;
	lineNumber?: number;
	stack?: {
		callFrames?: Array<{ functionName?: string; url?: string; lineNumber?: number; columnNumber?: number }>;
		parent?: HarInitiator["stack"];
	};
}

export interface HarEntry {
	pageref?: string;
	startedDateTime?: string;
	time?: number;
	request?: HarRequest;
	response?: HarResponse;
	cache?: unknown;
	timings?: HarTimings;
	serverIPAddress?: string;
	connection?: string;
	/** Chrome extensions */
	_resourceType?: string;
	_initiator?: HarInitiator;
	_priority?: string;
	_fromCache?: "memory" | "disk" | string;
	_transferSize?: number;
}

export interface HarPage {
	startedDateTime?: string;
	id?: string;
	title?: string;
	pageTimings?: {
		onContentLoad?: number;
		onLoad?: number;
	};
}

export interface HarLog {
	version?: string;
	creator?: { name?: string; version?: string };
	browser?: { name?: string; version?: string };
	pages?: HarPage[];
	entries?: HarEntry[];
}

export interface Har {
	log: HarLog;
}
