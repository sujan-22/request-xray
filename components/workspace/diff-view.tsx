"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { inlineChange, type KeyedRow, type SideRow } from "@/lib/diff/diff";
import { formatBytes, formatMs } from "@/lib/format";
import type { RequestRecord } from "@/lib/model";
import { Redactor } from "@/lib/redact/redact";
import type { BodyDiff, RequestDiff } from "@/lib/worker/request-diff";
import { Dialog } from "../ui/dialog";
import { ChevronDown, Eye, EyeOff, Search } from "../ui/icons";
import { MethodTag, StatusTag, TypeSwatch } from "../ui/marks";
import { useWorkspace } from "./context";

type Pair = { a: number | null; b: number | null };
const redactor = new Redactor();
const CONTEXT = 3;

function RequestPicker({ label, value, onChange, exclude }: { label: string; value: number | null; onChange: (id: number) => void; exclude: number | null }) {
	const { requests } = useWorkspace();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const listId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const selected = value !== null ? requests[value] : null;

	const matches = useMemo(() => {
		const q = query.toLowerCase();
		return requests.filter((r) => r.id !== exclude && (!q || `${r.method} ${r.url} ${r.status}`.toLowerCase().includes(q))).slice(0, 150);
	}, [requests, query, exclude]);

	useEffect(() => {
		if (open) inputRef.current?.focus();
	}, [open]);

	return (
		<div className="relative min-w-0">
			<p className="label-sm mb-1.5 text-(--muted)">{label}</p>
			<button
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2.5 rounded-[3px] border border-(--rule-strong) bg-paper px-3 py-2.5 text-left hover:border-ink"
			>
				{selected ? (
					<>
						<span className="font-mono text-[0.6875rem] text-(--muted)">#{selected.id + 1}</span>
						<TypeSwatch type={selected.type} />
						<MethodTag method={selected.method} />
						<span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]">{selected.name}</span>
						<StatusTag status={selected.status} failed={selected.failed} />
					</>
				) : (
					<span className="flex-1 text-(--muted)">Choose a request…</span>
				)}
				<ChevronDown className="shrink-0 text-(--muted)" />
			</button>
			{open ? (
				<div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[3px] border border-(--rule-strong) bg-paper shadow-[0_20px_40px_-20px_rgb(17_18_20/0.5)]">
					<label className="flex items-center gap-2 border-b border-(--rule) px-3">
						<Search className="text-(--muted)" />
						<span className="sr-only">Search requests</span>
						<input
							ref={inputRef}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.stopPropagation();
									setOpen(false);
								}
								if (event.key === "Enter" && matches[0]) {
									onChange(matches[0].id);
									setOpen(false);
								}
							}}
							placeholder="Filter by URL, method or status"
							className="h-9 flex-1 bg-transparent font-mono text-[0.75rem] outline-none"
							role="combobox"
							aria-controls={listId}
							aria-expanded
						/>
					</label>
					<ul id={listId} role="listbox" className="scroll-thin max-h-72 overflow-y-auto">
						{matches.map((r) => (
							<li key={r.id} role="option" aria-selected={r.id === value}>
								<button
									type="button"
									onClick={() => {
										onChange(r.id);
										setOpen(false);
									}}
									className={`grid w-full grid-cols-[2.5rem_0.75rem_3rem_1fr_2rem_4rem] items-center gap-2 px-3 py-1.5 text-left hover:bg-(--hover) ${r.id === value ? "bg-paper-2" : ""}`}
								>
									<span className="font-mono text-[0.6875rem] text-(--muted)">#{r.id + 1}</span>
									<TypeSwatch type={r.type} />
									<MethodTag method={r.method} />
									<span className="truncate font-mono text-[0.75rem]" title={r.url}>
										{r.path}
										<span className="text-(--muted)">{r.search}</span>
									</span>
									<StatusTag status={r.status} failed={r.failed} />
									<span className="text-right font-mono text-[0.6875rem] text-(--muted)">{formatMs(r.duration)}</span>
								</button>
							</li>
						))}
						{matches.length === 0 ? <li className="px-3 py-3 text-(--muted)">No requests match.</li> : null}
					</ul>
				</div>
			) : null}
		</div>
	);
}

function Delta({ a, b, format, neutral = false }: { a: number; b: number; format: (n: number) => string; neutral?: boolean }) {
	const diff = b - a;
	if (Math.abs(diff) < 1) return <span className="text-(--muted)">same</span>;
	return (
		<span className={neutral ? "text-(--muted)" : diff > 0 ? "text-signal-deep" : "text-add"}>
			{diff > 0 ? "+" : "−"}
			{format(Math.abs(diff))}
		</span>
	);
}

function Summary({ a, b }: { a: RequestRecord; b: RequestRecord }) {
	const rows: Array<{ label: string; a: ReactNode; b: ReactNode; delta?: ReactNode; same: boolean }> = [
		{ label: "Method", a: a.method, b: b.method, same: a.method === b.method },
		{ label: "Path", a: a.path, b: b.path, same: a.path === b.path },
		{ label: "Status", a: a.status || "failed", b: b.status || "failed", same: a.status === b.status },
		{ label: "Started", a: formatMs(a.start), b: formatMs(b.start), delta: <Delta a={a.start} b={b.start} format={formatMs} neutral />, same: false },
		{ label: "Duration", a: formatMs(a.duration), b: formatMs(b.duration), delta: <Delta a={a.duration} b={b.duration} format={formatMs} />, same: Math.abs(a.duration - b.duration) < 0.5 },
		{ label: "Waiting", a: formatMs(a.timings.wait), b: formatMs(b.timings.wait), delta: <Delta a={a.timings.wait} b={b.timings.wait} format={formatMs} />, same: false },
		{ label: "Resource", a: formatBytes(a.contentSize), b: formatBytes(b.contentSize), delta: <Delta a={a.contentSize} b={b.contentSize} format={formatBytes} />, same: a.contentSize === b.contentSize },
	];
	return (
		<table className="w-full border-collapse font-mono text-[0.75rem]">
			<thead>
				<tr className="border-b border-(--rule-strong) text-left">
					<th className="label-sm w-28 py-1.5 font-normal text-(--muted)" scope="col">
						Field
					</th>
					<th className="label-sm py-1.5 font-normal text-(--muted)" scope="col">
						A
					</th>
					<th className="label-sm py-1.5 font-normal text-(--muted)" scope="col">
						B
					</th>
					<th className="label-sm w-28 py-1.5 text-right font-normal text-(--muted)" scope="col">
						B vs A
					</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.label} className="border-b border-(--rule)">
						<th scope="row" className="label-sm py-1.5 text-left font-normal text-(--muted)">
							{row.label}
						</th>
						<td className="break-all py-1.5 pr-3">{row.a}</td>
						<td className={`break-all py-1.5 pr-3 ${!row.same && !row.delta ? "text-signal-deep" : ""}`}>{row.b}</td>
						<td className="py-1.5 text-right">{row.delta ?? (row.same ? <span className="text-(--muted)">same</span> : <span className="text-signal-deep">differs</span>)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function KeyedTable({ rows, onlyChanges, mask }: { rows: KeyedRow[]; onlyChanges: boolean; mask: boolean }) {
	const shown = onlyChanges ? rows.filter((row) => row.status !== "same") : rows;
	if (!rows.length) return <p className="text-[0.8125rem] text-(--muted)">None on either side.</p>;
	if (!shown.length) return <p className="text-[0.8125rem] text-(--muted)">Identical ({rows.length}).</p>;
	const value = (row: KeyedRow, v: string | null) => {
		if (v === null) return <span className="text-(--muted)">(absent)</span>;
		if (mask && redactor.isSensitiveHeader(row.name)) return <span className="text-(--muted)">•••••••• hidden</span>;
		return v;
	};
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[36rem] border-collapse font-mono text-[0.71875rem]">
				<tbody>
					{shown.map((row) => (
						<tr key={row.name} className="border-b border-(--rule) align-top">
							<th scope="row" className="w-[22%] break-all py-1 pr-3 text-left font-normal text-(--muted)">
								<span
									aria-label={row.status}
									className={`mr-1.5 inline-block w-2 ${row.status === "added" ? "text-add" : row.status === "removed" ? "text-signal-deep" : row.status === "changed" ? "text-(--accent)" : "text-transparent"}`}
								>
									{row.status === "added" ? "+" : row.status === "removed" ? "−" : row.status === "changed" ? "~" : "·"}
								</span>
								{row.name}
							</th>
							<td className={`w-[39%] break-all py-1 pr-3 ${row.status === "removed" || row.status === "changed" ? "bg-signal/[0.07]" : ""}`}>{value(row, row.a)}</td>
							<td className={`w-[39%] break-all py-1 pr-3 ${row.status === "added" || row.status === "changed" ? "bg-type-style/[0.09]" : ""}`}>{value(row, row.b)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

type Block = { kind: "rows"; rows: SideRow[] } | { kind: "gap"; rows: SideRow[] };

/** Collapse long runs of unchanged lines, keeping a few lines of context around changes. */
function toBlocks(rows: SideRow[]): Block[] {
	const blocks: Block[] = [];
	let i = 0;
	while (i < rows.length) {
		if (rows[i]!.kind !== "equal") {
			const start = i;
			while (i < rows.length && rows[i]!.kind !== "equal") i++;
			blocks.push({ kind: "rows", rows: rows.slice(start, i) });
			continue;
		}
		const start = i;
		while (i < rows.length && rows[i]!.kind === "equal") i++;
		const run = rows.slice(start, i);
		const lead = start === 0 ? 0 : CONTEXT;
		const trail = i === rows.length ? 0 : CONTEXT;
		if (run.length <= lead + trail + 2) {
			blocks.push({ kind: "rows", rows: run });
		} else {
			if (lead) blocks.push({ kind: "rows", rows: run.slice(0, lead) });
			blocks.push({ kind: "gap", rows: run.slice(lead, run.length - trail) });
			if (trail) blocks.push({ kind: "rows", rows: run.slice(run.length - trail) });
		}
	}
	return blocks;
}

function Cell({ cell, other, side, kind }: { cell: SideRow["left"]; other: SideRow["left"]; side: "a" | "b"; kind: SideRow["kind"] }) {
	if (!cell) return <div className="bg-(--chip) [background-image:repeating-linear-gradient(135deg,transparent_0_6px,rgb(17_18_20/0.04)_6px_7px)]" />;
	const tint = kind === "equal" ? "" : side === "a" ? "bg-signal/[0.07]" : "bg-type-style/[0.09]";
	let content: ReactNode = cell.text || " ";
	if (kind === "change" && other) {
		const { prefix, suffixA, suffixB } = inlineChange(side === "a" ? cell.text : other.text, side === "a" ? other.text : cell.text);
		const end = side === "a" ? suffixA : suffixB;
		content = (
			<>
				{cell.text.slice(0, prefix)}
				<mark className={`rounded-[1px] text-inherit ${side === "a" ? "bg-signal/25" : "bg-type-style/25"}`}>{cell.text.slice(prefix, end)}</mark>
				{cell.text.slice(end)}
			</>
		);
	}
	return (
		<div className={`flex min-w-0 ${tint}`}>
			<span aria-hidden className="w-10 shrink-0 select-none pr-2 text-right text-(--muted)/70">
				{cell.line}
			</span>
			<span aria-hidden className={`w-3 shrink-0 select-none ${side === "a" ? "text-signal-deep" : "text-add"}`}>
				{kind === "equal" ? "" : side === "a" ? "−" : "+"}
			</span>
			<span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-3">{content}</span>
		</div>
	);
}

function BodyDiffView({ diff }: { diff: BodyDiff }) {
	const [expanded, setExpanded] = useState<Set<number>>(new Set());
	const blocks = useMemo(() => toBlocks(diff.rows), [diff.rows]);
	if (diff.missing === "both") return <p className="text-[0.8125rem] text-(--muted)">Neither request has a body.</p>;
	if (diff.tooLarge) return <p className="text-[0.8125rem] text-(--muted)">{diff.identical ? "Identical." : "The bodies differ, but they're too large to compare line by line."}</p>;
	if (diff.identical) return <p className="text-[0.8125rem] text-(--muted)">Identical ({diff.rows.length} lines).</p>;
	return (
		<div className="code overflow-hidden rounded-[3px] border border-(--rule)">
			{diff.missing ? <p className="label-sm border-b border-(--rule) px-3 py-1.5 text-(--muted)">{diff.missing === "a" ? "A has no body." : "B has no body."}</p> : null}
			{blocks.map((block, index) =>
				block.kind === "gap" && !expanded.has(index) ? (
					<button
						key={index}
						type="button"
						onClick={() => setExpanded(new Set(expanded).add(index))}
						className="label-sm block w-full border-y border-(--rule) bg-paper-2/60 px-3 py-1 text-left text-(--muted) hover:text-(--fg)"
					>
						⋯ {block.rows.length} unchanged lines
					</button>
				) : (
					block.rows.map((row, i) => (
						<div key={`${index}-${i}`} className="grid grid-cols-2 divide-x divide-(--rule)">
							<Cell cell={row.left} other={row.right} side="a" kind={row.kind} />
							<Cell cell={row.right} other={row.left} side="b" kind={row.kind} />
						</div>
					))
				),
			)}
		</div>
	);
}

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
	return (
		<section className="border-t border-(--rule-strong) pt-3">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<h3 className="label">{title}</h3>
				{meta ? <span className="label-sm text-(--muted)">{meta}</span> : null}
			</div>
			{children}
		</section>
	);
}

function changedCount(rows: KeyedRow[]) {
	const changed = rows.filter((row) => row.status !== "same").length;
	return changed ? `${changed} of ${rows.length} differ` : rows.length ? "identical" : "none";
}

export function DiffView({ state, onChange, onClose }: { state: Pair | null; onChange: (pair: Pair) => void; onClose: () => void }) {
	const { requests, analyzer } = useWorkspace();
	const [diff, setDiff] = useState<RequestDiff | null>(null);
	const [onlyChanges, setOnlyChanges] = useState(true);
	const [mask, setMask] = useState(true);
	const open = state !== null;
	const a = state?.a ?? null;
	const b = state?.b ?? null;
	const ready = a !== null && b !== null;
	const current = diff && diff.a === a && diff.b === b ? diff : null;

	useEffect(() => {
		if (a === null || b === null) return;
		let cancelled = false;
		analyzer.diff(a, b).then((result) => !cancelled && setDiff(result), () => undefined);
		return () => {
			cancelled = true;
		};
	}, [a, b, analyzer]);

	return (
		<Dialog
			open={open}
			onClose={onClose}
			variant="sheet"
			label="Diff"
			title="Compare two requests"
			actions={
				ready ? (
					<>
						<button type="button" onClick={() => setMask(!mask)} aria-pressed={!mask} className="label-sm hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-(--muted) hover:text-(--fg) sm:inline-flex">
							{mask ? <Eye /> : <EyeOff />} {mask ? "Show secrets" : "Hide secrets"}
						</button>
						<label className="label-sm inline-flex cursor-pointer items-center gap-2 rounded-full px-2.5 py-1.5 text-(--muted) hover:text-(--fg)">
							<input type="checkbox" checked={onlyChanges} onChange={(event) => setOnlyChanges(event.target.checked)} className="accent-signal" />
							Only differences
						</label>
					</>
				) : null
			}
		>
			<div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-5 sm:px-6">
				<div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
					<RequestPicker label="A" value={a} exclude={b} onChange={(id) => onChange({ a: id, b })} />
					<button
						type="button"
						onClick={() => onChange({ a: b, b: a })}
						disabled={!ready}
						className="label-sm h-10 rounded-full border border-(--rule-strong) px-4 hover:border-ink disabled:opacity-40"
						aria-label="Swap A and B"
					>
						⇄ Swap
					</button>
					<RequestPicker label="B" value={b} exclude={a} onChange={(id) => onChange({ a, b: id })} />
				</div>

				{!ready ? (
					<p className="serif py-10 text-center text-2xl text-(--muted)">Pick two requests to see what changed between them.</p>
				) : !current ? (
					<p className="label py-10 text-center text-(--muted)" aria-live="polite">
						Comparing…
					</p>
				) : (
					<>
						<Section title="Summary">
							<Summary a={requests[a]!} b={requests[b]!} />
							<div className="mt-3 grid gap-1 font-mono text-[0.6875rem] text-(--muted) md:grid-cols-2">
								<p className="break-all">A {requests[a]!.url}</p>
								<p className="break-all">B {requests[b]!.url}</p>
							</div>
						</Section>
						<Section title="Query parameters" meta={changedCount(current.query)}>
							<KeyedTable rows={current.query} onlyChanges={onlyChanges} mask={false} />
						</Section>
						<Section title="Request body" meta={current.requestBody.missing === "both" ? "none" : `${current.requestBody.changed} changed lines`}>
							<BodyDiffView diff={current.requestBody} />
						</Section>
						<Section title="Request headers" meta={changedCount(current.requestHeaders)}>
							<KeyedTable rows={current.requestHeaders} onlyChanges={onlyChanges} mask={mask} />
						</Section>
						<Section title="Response body" meta={current.responseBody.missing === "both" ? "none" : `${current.responseBody.changed} changed lines`}>
							<BodyDiffView diff={current.responseBody} />
						</Section>
						<Section title="Response headers" meta={changedCount(current.responseHeaders)}>
							<KeyedTable rows={current.responseHeaders} onlyChanges={onlyChanges} mask={mask} />
						</Section>
					</>
				)}
			</div>
		</Dialog>
	);
}
