"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatCount } from "@/lib/format";
import { CopyButton } from "./copy-button";

const MAX_LINES = 3000;
/** Above this, skip syntax colouring: plain text renders much faster. */
const MAX_HIGHLIGHT_CHARS = 400_000;
const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

export function prettyJson(text: string): string {
	try {
		return JSON.stringify(JSON.parse(text), null, 2);
	} catch {
		return text;
	}
}

function highlightJsonLine(line: string): ReactNode[] {
	const out: ReactNode[] = [];
	let last = 0;
	let match: RegExpExecArray | null;
	JSON_TOKEN.lastIndex = 0;
	while ((match = JSON_TOKEN.exec(line))) {
		if (match.index > last) out.push(line.slice(last, match.index));
		const [whole, str, colon, num, lit, punct] = match;
		const key = out.length;
		if (str !== undefined) {
			if (colon) {
				out.push(
					<span key={key} className="tok-key">
						{str}
					</span>,
					<span key={`${key}c`} className="tok-punct">
						{colon}
					</span>,
				);
			} else {
				out.push(
					<span key={key} className="tok-string">
						{str}
					</span>,
				);
			}
		} else if (num !== undefined) {
			out.push(
				<span key={key} className="tok-number">
					{num}
				</span>,
			);
		} else if (lit !== undefined) {
			out.push(
				<span key={key} className="tok-literal">
					{lit}
				</span>,
			);
		} else if (punct !== undefined) {
			out.push(
				<span key={key} className="tok-punct">
					{punct}
				</span>,
			);
		} else {
			out.push(whole);
		}
		last = match.index + whole.length;
	}
	if (last < line.length) out.push(line.slice(last));
	return out;
}

interface CodeViewProps {
	text: string;
	json?: boolean;
	label?: string;
	truncated?: boolean;
	fullLength?: number;
	maxHeight?: string;
}

export function CodeView({ text, json = false, label, truncated = false, fullLength, maxHeight = "28rem" }: CodeViewProps) {
	const [showAll, setShowAll] = useState(false);
	const [wrap, setWrap] = useState(true);
	const pretty = useMemo(() => (json ? prettyJson(text) : text), [text, json]);
	const lines = useMemo(() => pretty.split("\n"), [pretty]);
	const shown = showAll ? lines : lines.slice(0, MAX_LINES);
	const colour = json && pretty.length <= MAX_HIGHLIGHT_CHARS;
	const gutter = String(lines.length).length;

	return (
		<div className="overflow-hidden rounded-[3px] border border-(--rule) bg-paper-2/50">
			<div className="flex items-center justify-between gap-3 border-b border-(--rule) px-3 py-1.5">
				<span className="label-sm text-(--muted)">
					{label ? `${label} · ` : ""}
					{formatCount(lines.length)} {lines.length === 1 ? "line" : "lines"}
					{json ? " · JSON" : ""}
				</span>
				<div className="flex items-center gap-1">
					<button type="button" onClick={() => setWrap(!wrap)} aria-pressed={wrap} className="label-sm rounded px-1.5 py-0.5 text-(--muted) hover:text-(--fg)">
						Wrap
					</button>
					<CopyButton value={pretty} label="Copy" />
				</div>
			</div>
			<div className="scroll-thin overflow-auto" style={{ maxHeight }}>
				<pre className={`code m-0 py-2 ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
					{shown.map((line, index) => (
						<div key={index} className="flex">
							<span aria-hidden className="sticky left-0 shrink-0 select-none bg-paper-2 pl-3 pr-3 text-right text-(--muted)/70" style={{ width: `${gutter + 3}ch` }}>
								{index + 1}
							</span>
							<span className="min-w-0 flex-1 pr-3">{colour ? highlightJsonLine(line) : line || " "}</span>
						</div>
					))}
				</pre>
			</div>
			{lines.length > MAX_LINES && !showAll ? (
				<button type="button" onClick={() => setShowAll(true)} className="label-sm w-full border-t border-(--rule) px-3 py-2 text-left text-(--muted) hover:text-(--fg)">
					Show all {formatCount(lines.length)} lines
				</button>
			) : null}
			{truncated ? (
				<p className="label-sm border-t border-(--rule) px-3 py-2 text-(--muted)">
					Showing the first {formatCount(text.length)} of {formatCount(fullLength ?? text.length)} characters.
				</p>
			) : null}
		</div>
	);
}
