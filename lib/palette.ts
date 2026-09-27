import type { ResourceType, Severity } from "./model";

/**
 * Resource-type inks. Signal orange is reserved for findings and selection, so
 * types get muted, print-like tones that each hold at least 3:1 against paper.
 * API calls are the subject of this tool, so they get the full ink.
 */
export const TYPE_META: Record<ResourceType, { label: string; short: string; color: string; onInk: string }> = {
	api: { label: "API (fetch / XHR)", short: "API", color: "#111214", onInk: "#eeebe3" },
	document: { label: "Document", short: "DOC", color: "#2c4a7c", onInk: "#8fb0e6" },
	script: { label: "Script", short: "JS", color: "#8f6b10", onInk: "#e0bd5c" },
	style: { label: "Stylesheet", short: "CSS", color: "#2f6f6a", onInk: "#79c2bb" },
	image: { label: "Image", short: "IMG", color: "#76598a", onInk: "#c2a6d6" },
	font: { label: "Font", short: "FONT", color: "#5a6b2a", onInk: "#b3c47a" },
	media: { label: "Media", short: "MEDIA", color: "#8e4a5c", onInk: "#e09aad" },
	other: { label: "Other", short: "OTHER", color: "#7f7a70", onInk: "#a8a398" },
};

export const SEVERITY_META: Record<Severity, { label: string; short: string }> = {
	high: { label: "High", short: "HIGH" },
	medium: { label: "Medium", short: "MED" },
	low: { label: "Low", short: "LOW" },
};

export const COLORS = {
	paper: "#eeebe3",
	paper2: "#e4e0d5",
	ink: "#111214",
	ink2: "#17181b",
	signal: "#ff4d17",
	signalDeep: "#b02f0a",
	mute: "#5d5951",
	muteDark: "#9a968d",
} as const;
