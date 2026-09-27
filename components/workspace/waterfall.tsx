"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { formatBytes, formatMs, formatTick, timeTicks } from "@/lib/format";
import type { RequestRecord, ResourceType } from "@/lib/model";
import { TYPE_META } from "@/lib/palette";
import { isEmptySearch, matchSearch, parseSearch } from "@/lib/search";
import { MethodTag, SeverityMark, StatusTag, TypeSwatch } from "../ui/marks";
import { toPercent, useWorkspace, type Domain } from "./context";

const ROW = 30;
const OVERSCAN = 10;
const HEADER = 26;

export function useFilteredRequests(query: string, types: ResourceType[], respectZoom: boolean) {
	const { requests, highlighted, isolate, domain, fullDomain } = useWorkspace();
	return useMemo(() => {
		const search = parseSearch(query);
		const hasSearch = !isEmptySearch(search);
		const zoomed = respectZoom && (domain.from !== fullDomain.from || domain.to !== fullDomain.to);
		return requests.filter((r) => {
			if (isolate && highlighted && !highlighted.has(r.id)) return false;
			if (types.length && !types.includes(r.type)) return false;
			if (zoomed && (r.end < domain.from || r.start > domain.to)) return false;
			return !hasSearch || matchSearch(r, search);
		});
	}, [requests, highlighted, isolate, query, types, domain, fullDomain, respectZoom]);
}

interface RowProps {
	r: RequestRecord;
	top: number;
	domain: Domain;
	hot: boolean;
	dim: boolean;
	selected: boolean;
	severity: "high" | "medium" | "low" | null;
	onSelect: (id: number) => void;
}

const Row = memo(function Row({ r, top, domain, hot, dim, selected, severity, onSelect }: RowProps) {
	const left = toPercent(r.start, domain);
	const right = toPercent(r.end, domain);
	const color = hot ? "var(--color-signal)" : TYPE_META[r.type].color;

	// Phase split: queue/connect as a hairline, waiting as a tint, download solid.
	const t = r.timings;
	const pre = t.blocked + t.dns + t.connect + t.ssl + t.send;
	const phaseTotal = pre + t.wait + t.receive;
	const prePct = phaseTotal > 0 ? (pre / phaseTotal) * 100 : 0;
	const waitPct = phaseTotal > 0 ? (t.wait / phaseTotal) * 100 : 0;
	const recvPct = phaseTotal > 0 ? 100 - prePct - waitPct : 100;

	const offLeft = right < 0;
	const offRight = left > 100;
	const alignEnd = !offLeft && !offRight && left > 58;
	const labelStyle: CSSProperties = offLeft
		? { left: 4 }
		: offRight
			? { right: 4 }
			: alignEnd
				? { right: `${Math.max(0, 100 - right)}%` }
				: { left: `${Math.max(0, left)}%` };

	const bytes = r.fromCache ? null : r.transferSize >= 0 ? r.transferSize : r.contentSize;

	return (
		<div
			role="option"
			id={`req-${r.id}`}
			aria-selected={selected}
			aria-label={`${r.method} ${r.name}, ${r.status || "failed"}, ${formatMs(r.duration)}`}
			onClick={() => onSelect(r.id)}
			className={`group absolute inset-x-0 grid cursor-pointer grid-cols-[var(--gutter)_1fr_var(--size-col)] items-stretch border-b border-(--rule) transition-[opacity,background-color] duration-200 ${
				selected ? "bg-paper-3/70" : "hover:bg-(--hover)"
			} ${dim ? "row-dim" : ""}`}
			style={{ transform: `translateY(${top}px)`, height: ROW }}
		>
			<div className="relative flex items-center gap-2 pl-3 pr-2 sm:pl-4">
				{selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-signal" /> : null}
				<span className="hidden w-7 shrink-0 text-right font-mono text-[0.6875rem] text-(--muted) tnum sm:inline">{r.id + 1}</span>
				<TypeSwatch type={r.type} className="dim-graphic" />
				<MethodTag method={r.method} className="w-12 shrink-0" />
				<StatusTag status={r.status} failed={r.failed} className="w-7 shrink-0" />
				{severity ? <SeverityMark severity={severity} className={hot ? "" : "dim-graphic opacity-60"} /> : null}
			</div>

			<div className="relative overflow-hidden">
				<span
					className="pointer-events-none absolute top-[3px] flex max-w-full items-baseline gap-1.5 whitespace-nowrap font-mono text-[0.6875rem] leading-none"
					style={labelStyle}
				>
					<span className={`truncate ${hot ? "font-medium text-signal-deep" : "text-(--fg)"}`}>
						{offLeft ? "◂ " : ""}
						{r.name}
						{offRight ? " ▸" : ""}
					</span>
					{r.method === "OPTIONS" ? <span className="text-(--muted)">preflight</span> : null}
					{r.firstParty ? null : <span className="truncate text-(--muted)">{r.host}</span>}
					<span className="shrink-0 text-(--muted) tnum">{formatMs(r.duration)}</span>
				</span>
				{!offLeft && !offRight ? (
					<span
						aria-hidden
						className="dim-graphic absolute bottom-[6px] flex h-[9px] items-center"
						style={{ left: `${left}%`, width: `max(2px, ${right - left}%)` }}
					>
						{prePct > 0.5 ? <span className="h-px" style={{ width: `${prePct}%`, background: color, opacity: 0.7 }} /> : null}
						{waitPct > 0.5 ? <span className="h-full" style={{ width: `${waitPct}%`, background: color, opacity: hot ? 0.6 : 0.38 }} /> : null}
						<span className="h-full min-w-[2px] rounded-r-[1px]" style={{ width: `${recvPct}%`, background: color }} />
					</span>
				) : null}
			</div>

			<div className="flex items-center justify-end pr-3 font-mono text-[0.6875rem] text-(--muted) tnum sm:pr-4">
				{bytes === null ? <span title={`Served from ${r.fromCache} cache`}>{r.fromCache}</span> : formatBytes(bytes)}
			</div>
		</div>
	);
});

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function Waterfall({ query, types }: { query: string; types: ResourceType[] }) {
	const { report, domain, highlighted, selectedId, select, activeFinding, findingsByRequest, isolate } = useWorkspace();
	const rows = useFilteredRequests(query, types, true);
	const scrollRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewport, setViewport] = useState(600);
	const [trackWidth, setTrackWidth] = useState(0);
	const [hoverX, setHoverX] = useState<number | null>(null);

	useLayoutEffect(() => {
		const scroller = scrollRef.current;
		const track = trackRef.current;
		if (!scroller || !track) return;
		const observer = new ResizeObserver(() => {
			setViewport(scroller.clientHeight);
			setTrackWidth(track.clientWidth);
		});
		observer.observe(scroller);
		observer.observe(track);
		return () => observer.disconnect();
	}, []);

	const indexById = useMemo(() => new Map(rows.map((r, index) => [r.id, index])), [rows]);
	const selectedIndex = selectedId !== null ? (indexById.get(selectedId) ?? -1) : -1;

	const scrollToIndex = useCallback(
		(index: number, align: "nearest" | "center" = "nearest") => {
			const scroller = scrollRef.current;
			if (!scroller || index < 0) return;
			const top = index * ROW;
			const view = scroller.clientHeight - HEADER;
			if (align === "center") scroller.scrollTop = Math.max(0, top - view / 2);
			else if (top < scroller.scrollTop) scroller.scrollTop = top;
			else if (top + ROW > scroller.scrollTop + view) scroller.scrollTop = top + ROW - view;
		},
		[],
	);

	useEffect(() => {
		if (selectedIndex >= 0) scrollToIndex(selectedIndex);
	}, [selectedIndex, scrollToIndex]);

	// Bring the active finding into view.
	useEffect(() => {
		if (!activeFinding) return;
		const first = activeFinding.requestIds.map((id) => indexById.get(id) ?? Infinity).reduce((a, b) => Math.min(a, b), Infinity);
		if (Number.isFinite(first)) scrollToIndex(first, "center");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeFinding?.id, isolate]);

	const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
	const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW) + OVERSCAN);

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!rows.length) return;
		const page = Math.max(1, Math.floor((viewport - HEADER) / ROW) - 1);
		let next: number | null = null;
		switch (event.key) {
			case "ArrowDown":
			case "j":
				next = selectedIndex < 0 ? 0 : Math.min(rows.length - 1, selectedIndex + 1);
				break;
			case "ArrowUp":
			case "k":
				next = selectedIndex < 0 ? 0 : Math.max(0, selectedIndex - 1);
				break;
			case "PageDown":
				next = Math.min(rows.length - 1, Math.max(0, selectedIndex) + page);
				break;
			case "PageUp":
				next = Math.max(0, selectedIndex - page);
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = rows.length - 1;
				break;
		}
		if (next === null) return;
		event.preventDefault();
		select(rows[next]!.id);
	};

	const ticks = useMemo(() => timeTicks(domain.from, domain.to, Math.max(3, Math.floor(trackWidth / 120))), [domain, trackWidth]);

	const markers = report.pages.flatMap((page) => [
		...(page.onContentLoad !== null ? [{ at: page.onContentLoad, label: "DCL", hot: false }] : []),
		...(page.onLoad !== null ? [{ at: page.onLoad, label: "Load", hot: true }] : []),
	]);

	// Elbow connectors for a sequential chain.
	const connectors = useMemo(() => {
		const chain = activeFinding?.chain;
		if (!chain || !trackWidth) return [];
		const x = (ms: number) => (toPercent(ms, domain) / 100) * trackWidth;
		const barY = ROW - 6 - 4.5;
		const paths: string[] = [];
		for (let i = 1; i < chain.length; i++) {
			const a = indexById.get(chain[i - 1]!);
			const b = indexById.get(chain[i]!);
			if (a === undefined || b === undefined) continue;
			const ra = rows[a]!;
			const rb = rows[b]!;
			const x1 = x(ra.end);
			const y1 = a * ROW + barY;
			const x2 = x(rb.start);
			const y2 = b * ROW + barY;
			const elbow = Math.max(x1, x2) + 5;
			paths.push(`M ${x1} ${y1} H ${elbow} V ${y2} H ${x2}`);
		}
		return paths;
	}, [activeFinding, trackWidth, domain, indexById, rows]);

	const hoverMs = hoverX !== null && trackWidth ? domain.from + (hoverX / trackWidth) * (domain.to - domain.from) : null;

	const worstSeverity = (id: number) => {
		const list = findingsByRequest.get(id);
		if (!list?.length) return null;
		return list.reduce((best, f) => (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[best] ? f.severity : best), list[0]!.severity);
	};

	return (
		<div
			ref={scrollRef}
			role="listbox"
			tabIndex={0}
			aria-label={`Requests, ${rows.length} shown`}
			aria-activedescendant={selectedIndex >= first && selectedIndex < last ? `req-${selectedId}` : undefined}
			onKeyDown={onKeyDown}
			onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
			onMouseMove={(event) => {
				const track = trackRef.current;
				if (!track) return;
				const rect = track.getBoundingClientRect();
				const x = event.clientX - rect.left;
				setHoverX(x >= 0 && x <= rect.width ? x : null);
			}}
			onMouseLeave={() => setHoverX(null)}
			className="surface-paper scroll-thin relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-paper outline-none [--gutter:9.5rem] [--size-col:4.75rem] focus-visible:shadow-[inset_0_0_0_2px_var(--color-signal)] sm:[--gutter:11.5rem] sm:[--size-col:5.5rem]"
		>
			{/* Sticky axis header */}
			<div className="sticky top-0 z-20 grid grid-cols-[var(--gutter)_1fr_var(--size-col)] border-b border-(--rule-strong) bg-paper/95 backdrop-blur-sm" style={{ height: HEADER }}>
				<div className="label-sm flex items-center gap-2 pl-3 text-(--muted) sm:pl-4">
					<span className="hidden w-7 text-right sm:inline">#</span>
					<span className="w-3" />
					<span className="w-12">Method</span>
					<span className="w-7">Code</span>
				</div>
				<div ref={trackRef} className="relative">
					{ticks.map((tick) => (
						<span
							key={tick}
							className={`label-sm absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-1 text-[0.5625rem] text-(--muted) ${toPercent(tick, domain) > 92 ? "-translate-x-full" : ""}`}
							style={{ left: `${toPercent(tick, domain)}%` }}
						>
							{formatTick(tick)}
						</span>
					))}
					{hoverMs !== null && hoverX !== null ? (
						<span
							className="label-sm absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-ink px-1.5 py-0.5 text-[0.5625rem] text-paper tnum"
							style={{ left: hoverX }}
						>
							{formatMs(hoverMs)}
						</span>
					) : null}
				</div>
				<div className="label-sm flex items-center justify-end pr-3 text-(--muted) sm:pr-4">Size</div>
			</div>

			{rows.length === 0 ? (
				<div className="flex flex-col items-start gap-2 px-5 py-10">
					<p className="serif text-2xl">No requests match.</p>
					<p className="text-(--muted)">Clear the filter, the type chips or the zoom to see more.</p>
				</div>
			) : null}

			<div className="relative" style={{ height: rows.length * ROW }}>
				{/* Grid lines, page markers, crosshair and chain connectors, aligned with the track. */}
				<div aria-hidden className="pointer-events-none absolute inset-y-0 left-(--gutter) right-(--size-col)">
					{ticks.map((tick) => (
						<span key={tick} className="absolute inset-y-0 w-px bg-(--rule)/60" style={{ left: `${toPercent(tick, domain)}%` }} />
					))}
					{markers.map((marker) => {
						const at = toPercent(marker.at, domain);
						if (at < 0 || at > 100) return null;
						return (
							<span
								key={marker.label}
								title={`${marker.label} ${formatMs(marker.at)}`}
								className="absolute inset-y-0 w-px border-l border-dashed"
								style={{ left: `${at}%`, borderColor: marker.hot ? "rgb(176 47 10 / 0.7)" : "rgb(44 74 124 / 0.55)" }}
							/>
						);
					})}
					{hoverX !== null ? <span className="absolute inset-y-0 z-10 w-px bg-ink/35" style={{ left: hoverX }} /> : null}
					{connectors.length ? (
						<svg className="absolute inset-0 z-10 overflow-visible" width={trackWidth} height={rows.length * ROW}>
							{connectors.map((d, i) => (
								<g key={i}>
									<path d={d} fill="none" stroke="var(--color-signal)" strokeWidth={1.25} strokeLinejoin="round" />
								</g>
							))}
						</svg>
					) : null}
				</div>

				{rows.slice(first, last).map((r, offset) => {
					const index = first + offset;
					return (
						<Row
							key={r.id}
							r={r}
							top={index * ROW}
							domain={domain}
							hot={highlighted?.has(r.id) ?? false}
							dim={highlighted !== null && !highlighted.has(r.id)}
							selected={r.id === selectedId}
							severity={worstSeverity(r.id)}
							onSelect={select}
						/>
					);
				})}
			</div>
		</div>
	);
}
