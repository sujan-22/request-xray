"use client";

import { Fragment, useMemo, useState } from "react";
import { RULE_INFO } from "@/lib/analysis/rule-info";
import { formatBytes, formatMs } from "@/lib/format";
import type { EndpointStat, ResourceType } from "@/lib/model";
import { ChevronDown, ChevronRight } from "../ui/icons";
import { MethodTag, SeverityMark, StatusTag, TypeSwatch } from "../ui/marks";
import { Rug } from "../ui/rug";
import { useWorkspace } from "./context";
import { useFilteredRequests } from "./waterfall";

type SortKey = "endpoint" | "calls" | "totalTime" | "avgTime" | "maxTime" | "totalTransfer";

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean; className?: string }> = [
	{ key: "endpoint", label: "Endpoint", numeric: false },
	{ key: "calls", label: "Calls", numeric: true, className: "w-16 xl:w-24" },
	{ key: "totalTime", label: "Total", numeric: true, className: "w-20" },
	{ key: "avgTime", label: "Avg", numeric: true, className: "hidden w-20 md:table-cell" },
	{ key: "maxTime", label: "Max", numeric: true, className: "hidden w-20 xl:table-cell" },
	{ key: "totalTransfer", label: "Size", numeric: true, className: "hidden w-20 sm:table-cell" },
];

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Render {placeholders} in the accent colour and query keys muted. */
function Pattern({ pattern }: { pattern: string }) {
	const [path, query] = pattern.split("?");
	const parts = path!.split(/(\{[a-z]+\})/g);
	return (
		<>
			{parts.map((part, index) =>
				/^\{[a-z]+\}$/.test(part) ? (
					<span key={index} className="text-(--accent)">
						{part}
					</span>
				) : (
					<Fragment key={index}>{part}</Fragment>
				),
			)}
			{query ? <span className="text-(--muted)">?{query}</span> : null}
		</>
	);
}

export function EndpointsTable({ query, types }: { query: string; types: ResourceType[] }) {
	const { report, fullDomain, requests, highlighted, findingsByEndpoint, select, selectedId, setActiveFinding } = useWorkspace();
	const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "calls", dir: "desc" });
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const visible = useFilteredRequests(query, types, false);

	const rows = useMemo(() => {
		const visibleIds = new Set(visible.map((r) => r.id));
		const filtered = report.endpoints.filter((ep) => ep.requestIds.some((id) => visibleIds.has(id)));
		const dir = sort.dir === "asc" ? 1 : -1;
		return filtered.sort((a, b) => {
			if (sort.key === "endpoint") return dir * `${a.host}${a.pattern}`.localeCompare(`${b.host}${b.pattern}`);
			return dir * (a[sort.key] - b[sort.key]) || b.calls - a.calls;
		});
	}, [report.endpoints, visible, sort]);

	const maxCalls = Math.max(1, ...report.endpoints.map((ep) => ep.calls));

	const toggle = (key: string) =>
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const onSort = (key: SortKey) =>
		setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "endpoint" ? "asc" : "desc" }));

	return (
		<div className="surface-paper scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
			<table className="w-full table-fixed border-collapse text-left">
				<caption className="sr-only">Requests grouped by method and normalized URL. Select a column header to sort.</caption>
				<thead className="sticky top-0 z-10 bg-paper/95 backdrop-blur-sm">
					<tr className="border-b border-(--rule-strong)">
						<th scope="col" className="w-9" aria-label="Expand" />
						{COLUMNS.map((column) => {
							const active = sort.key === column.key;
							return (
								<th
									key={column.key}
									scope="col"
									aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
									className={`py-0 font-normal ${column.numeric ? "text-right" : ""} ${column.className ?? ""}`}
								>
									<button
										type="button"
										onClick={() => onSort(column.key)}
										className={`label-sm inline-flex h-8 items-center gap-1 px-2 transition-colors ${active ? "text-(--fg)" : "text-(--muted) hover:text-(--fg)"}`}
									>
										{column.label}
										<span aria-hidden className={`text-[0.625rem] ${active ? "opacity-100" : "opacity-0"}`}>
											{sort.dir === "asc" ? "↑" : "↓"}
										</span>
									</button>
								</th>
							);
						})}
						<th scope="col" className="label-sm hidden w-[24%] px-3 text-left font-normal text-(--muted) lg:table-cell">
							When
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((ep) => (
						<EndpointRow
							key={ep.key}
							ep={ep}
							open={expanded.has(ep.key)}
							onToggle={() => toggle(ep.key)}
							maxCalls={maxCalls}
							fullDomain={fullDomain}
							highlighted={highlighted}
							findings={findingsByEndpoint.get(ep.key) ?? []}
							requests={requests}
							selectedId={selectedId}
							onSelect={select}
							onFinding={setActiveFinding}
						/>
					))}
				</tbody>
			</table>
			{rows.length === 0 ? <p className="serif px-5 py-10 text-2xl">No endpoints match.</p> : null}
		</div>
	);
}

interface EndpointRowProps {
	ep: EndpointStat;
	open: boolean;
	onToggle: () => void;
	maxCalls: number;
	fullDomain: { from: number; to: number };
	highlighted: Set<number> | null;
	findings: ReturnType<typeof useWorkspace>["report"]["findings"];
	requests: ReturnType<typeof useWorkspace>["requests"];
	selectedId: number | null;
	onSelect: (id: number) => void;
	onFinding: (id: string) => void;
}

function EndpointRow({ ep, open, onToggle, maxCalls, fullDomain, highlighted, findings, requests, selectedId, onSelect, onFinding }: EndpointRowProps) {
	const calls = ep.requestIds.map((id) => requests[id]!);
	const worst = findings.reduce<(typeof findings)[number] | null>((best, f) => (!best || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[best.severity] ? f : best), null);
	const hot = highlighted ? ep.requestIds.some((id) => highlighted.has(id)) : false;
	const dim = highlighted !== null && !hot;

	return (
		<>
			<tr className={`group cursor-pointer border-b border-(--rule) hover:bg-(--hover) ${dim ? "row-dim" : ""} ${open ? "bg-paper-2/60" : ""}`} onClick={onToggle}>
				<td className="pl-3 align-middle">
					<button
						type="button"
						aria-expanded={open}
						aria-label={`${open ? "Hide" : "Show"} ${ep.calls} calls to ${ep.method} ${ep.pattern}`}
						onClick={(event) => {
							event.stopPropagation();
							onToggle();
						}}
						className="grid size-6 place-items-center text-(--muted) group-hover:text-(--fg)"
					>
						{open ? <ChevronDown /> : <ChevronRight />}
					</button>
				</td>
				<td className="max-w-0 py-2 pl-2 pr-3">
					<div className="flex min-w-0 items-center gap-2">
						<TypeSwatch type={ep.type} className="dim-graphic" />
						<MethodTag method={ep.method} className="w-12 shrink-0" />
						<span className={`truncate font-mono text-[0.75rem] ${hot ? "text-signal-deep" : ""}`} title={`${ep.host}${ep.pattern}`}>
							<Pattern pattern={ep.pattern} />
						</span>
						{worst ? (
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onFinding(worst.id);
								}}
								title={findings.map((f) => RULE_INFO[f.rule].label).join(", ")}
								className="label-sm inline-flex shrink-0 items-center gap-1 rounded-full border border-(--rule) px-1.5 py-0.5 text-(--muted) hover:border-ink hover:text-(--fg)"
							>
								<SeverityMark severity={worst.severity} />
								{findings.length > 1 ? findings.length : RULE_INFO[worst.rule].code}
							</button>
						) : null}
					</div>
					<p className="mt-0.5 truncate pl-[4.75rem] font-mono text-[0.625rem] text-(--muted)">
						{ep.host}
						{ep.variants > 1 ? ` · ${ep.variants} variants` : ""}
						{ep.errors ? <span className="text-signal-deep"> · {ep.errors} failed</span> : null}
					</p>
				</td>
				<td className="px-2 text-right align-middle">
					<div className="flex items-center justify-end gap-2">
						<span aria-hidden className="hidden h-1 w-10 overflow-hidden rounded-full bg-(--chip) xl:block">
							<span className="block h-full bg-ink/60" style={{ width: `${(ep.calls / maxCalls) * 100}%` }} />
						</span>
						<span className={`font-mono text-[0.8125rem] tnum ${ep.calls >= 5 ? "font-medium" : ""}`}>{ep.calls}</span>
					</div>
				</td>
				<td className="px-2 text-right font-mono text-[0.75rem] tnum">{formatMs(ep.totalTime)}</td>
				<td className="hidden px-2 text-right font-mono text-[0.75rem] text-(--muted) tnum md:table-cell">{formatMs(ep.avgTime)}</td>
				<td className="hidden px-2 text-right font-mono text-[0.75rem] text-(--muted) tnum xl:table-cell">{formatMs(ep.maxTime)}</td>
				<td className="hidden px-2 text-right font-mono text-[0.75rem] text-(--muted) tnum sm:table-cell">{formatBytes(ep.totalTransfer)}</td>
				<td className="hidden px-3 lg:table-cell">
					<Rug requests={calls} from={fullDomain.from} to={fullDomain.to} highlight={highlighted} className="dim-graphic text-ink/75" height={12} />
				</td>
			</tr>
			{open
				? calls.map((r) => (
						<tr
							key={r.id}
							onClick={() => onSelect(r.id)}
							className={`cursor-pointer border-b border-(--rule) bg-paper-2/40 hover:bg-(--hover) ${selectedId === r.id ? "bg-paper-3/70" : ""}`}
						>
							<td />
							<td className="max-w-0 py-1.5 pl-[5.5rem] pr-3">
								<button type="button" className="block w-full truncate text-left font-mono text-[0.6875rem]" title={r.url}>
									<span className="text-(--muted)">#{r.id + 1} </span>
									{r.path}
									<span className="text-(--muted)">{r.search}</span>
								</button>
							</td>
							<td className="px-2 text-right">
								<StatusTag status={r.status} failed={r.failed} />
							</td>
							<td className="px-2 text-right font-mono text-[0.6875rem] tnum">{formatMs(r.duration)}</td>
							<td className="hidden px-2 text-right font-mono text-[0.6875rem] text-(--muted) tnum md:table-cell" title="Started at">
								at {formatMs(r.start)}
							</td>
							<td className="hidden xl:table-cell" />
							<td className="hidden px-2 text-right font-mono text-[0.6875rem] text-(--muted) tnum sm:table-cell">
								{r.transferSize >= 0 ? formatBytes(r.transferSize) : "n/a"}
							</td>
							<td className="hidden px-3 lg:table-cell">
								<Rug requests={[r]} from={fullDomain.from} to={fullDomain.to} highlight={highlighted} className="text-ink/60" height={8} />
							</td>
						</tr>
					))
				: null}
		</>
	);
}
