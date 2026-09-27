"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatMs, formatTick, timeTicks } from "@/lib/format";
import { useWorkspace, type Domain } from "./context";

const HEIGHT = 72;
const PAD = 7;
const MIN_SPAN_RATIO = 0.004;

type DragMode = "new" | "move" | "start" | "end";

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/**
 * The exposure: every request as a light line on ink film, dense bursts glow,
 * the active finding burns orange. Doubles as the zoom brush for the waterfall.
 */
export function Exposure() {
	const { requests, fullDomain, domain, setRange, highlighted, selectedId, select, report } = useWorkspace();
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const dragRef = useRef<{ mode: DragMode; startMs: number; origin: Domain; moved: boolean } | null>(null);
	const [width, setWidth] = useState(0);
	const [hover, setHover] = useState<{ x: number; ms: number; request: number | null } | null>(null);
	const [dragging, setDragging] = useState(false);
	const zoomed = domain.from !== fullDomain.from || domain.to !== fullDomain.to;
	const span = fullDomain.to - fullDomain.from;

	useLayoutEffect(() => {
		const element = wrapRef.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const rowHeight = (HEIGHT - PAD * 2) / Math.max(1, requests.length);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !width) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(HEIGHT * dpr);
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, HEIGHT);

		const x = (ms: number) => ((ms - fullDomain.from) / span) * width;
		const lineHeight = clamp(rowHeight * 0.72, 0.55, 2.6);
		const y = (index: number) => PAD + index * rowHeight + (rowHeight - lineHeight) / 2;

		// Base exposure: additive, so overlapping requests brighten like film.
		ctx.globalCompositeOperation = "lighter";
		requests.forEach((r, index) => {
			if (highlighted?.has(r.id)) return;
			const alpha = highlighted ? 0.13 : r.type === "api" ? 0.78 : 0.38;
			ctx.fillStyle = `rgba(238, 235, 227, ${alpha})`;
			ctx.fillRect(x(r.start), y(index), Math.max(1, x(r.end) - x(r.start)), lineHeight);
		});

		// The active finding burns through.
		if (highlighted) {
			ctx.globalCompositeOperation = "source-over";
			// Glow is per-rect work; skip it when the finding covers thousands of requests.
			ctx.shadowColor = "rgba(255, 77, 23, 0.9)";
			ctx.shadowBlur = highlighted.size > 2000 ? 0 : 8;
			ctx.fillStyle = "#ff4d17";
			requests.forEach((r, index) => {
				if (!highlighted.has(r.id)) return;
				ctx.fillRect(x(r.start), y(index) - 0.5, Math.max(1.5, x(r.end) - x(r.start)), lineHeight + 1);
			});
			ctx.shadowBlur = 0;
		}

		if (selectedId !== null) {
			const index = requests.findIndex((r) => r.id === selectedId);
			const r = requests[index];
			if (r) {
				ctx.globalCompositeOperation = "source-over";
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(x(r.start), y(index) - 1, Math.max(2, x(r.end) - x(r.start)), lineHeight + 2);
				ctx.fillRect(x(r.start) - 1, PAD - 4, 1, HEIGHT - PAD * 2 + 8);
			}
		}
	}, [width, requests, highlighted, selectedId, fullDomain.from, span, rowHeight]);

	const ticks = useMemo(() => timeTicks(fullDomain.from, fullDomain.to, Math.max(3, Math.floor(width / 110))), [fullDomain, width]);
	const pct = (ms: number) => ((ms - fullDomain.from) / span) * 100;

	const markers = report.pages.flatMap((page) => [
		...(page.onContentLoad !== null ? [{ at: page.onContentLoad, label: "DCL", hot: false }] : []),
		...(page.onLoad !== null ? [{ at: page.onLoad, label: "Load", hot: true }] : []),
	]);

	const msAt = (clientX: number) => {
		const rect = wrapRef.current!.getBoundingClientRect();
		return fullDomain.from + clamp((clientX - rect.left) / rect.width, 0, 1) * span;
	};

	const requestAt = (clientX: number, clientY: number): number | null => {
		const rect = wrapRef.current!.getBoundingClientRect();
		const index = Math.floor((clientY - rect.top - PAD) / rowHeight);
		const r = requests[index];
		if (!r) return null;
		const ms = msAt(clientX);
		const slack = (4 / rect.width) * span;
		return ms >= r.start - slack && ms <= r.end + slack ? r.id : null;
	};

	const minSpan = span * MIN_SPAN_RATIO;

	const onPointerDown = (event: PointerEvent<HTMLElement>, mode: DragMode) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.preventDefault();
		wrapRef.current?.setPointerCapture(event.pointerId);
		wrapRef.current?.focus({ preventScroll: true });
		dragRef.current = { mode, startMs: msAt(event.clientX), origin: domain, moved: false };
		setDragging(true);
	};

	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const ms = msAt(event.clientX);
		const rect = wrapRef.current!.getBoundingClientRect();
		setHover({ x: event.clientX - rect.left, ms, request: requestAt(event.clientX, event.clientY) });
		const drag = dragRef.current;
		if (!drag) return;
		const delta = ms - drag.startMs;
		if (Math.abs(delta) > minSpan / 2) drag.moved = true;
		if (!drag.moved) return;
		const { origin } = drag;
		if (drag.mode === "new") {
			const from = Math.min(drag.startMs, ms);
			const to = Math.max(drag.startMs, ms);
			if (to - from >= minSpan) setRange({ from, to });
		} else if (drag.mode === "move") {
			const width = origin.to - origin.from;
			const from = clamp(origin.from + delta, fullDomain.from, fullDomain.to - width);
			setRange({ from, to: from + width });
		} else if (drag.mode === "start") {
			setRange({ from: clamp(ms, fullDomain.from, origin.to - minSpan), to: origin.to });
		} else {
			setRange({ from: origin.from, to: clamp(ms, origin.from + minSpan, fullDomain.to) });
		}
	};

	const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		dragRef.current = null;
		setDragging(false);
		if (drag && !drag.moved && drag.mode === "new") {
			const id = requestAt(event.clientX, event.clientY);
			if (id !== null) select(id);
		}
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const width = domain.to - domain.from;
		const setClamped = (from: number, to: number) => {
			const w = clamp(to - from, minSpan, span);
			const f = clamp(from, fullDomain.from, fullDomain.to - w);
			setRange(w >= span * 0.999 ? null : { from: f, to: f + w });
		};
		switch (event.key) {
			case "ArrowLeft":
			case "ArrowRight": {
				event.preventDefault();
				const step = (event.key === "ArrowRight" ? 1 : -1) * width * 0.1;
				if (event.shiftKey) setClamped(domain.from, domain.to + step);
				else setClamped(domain.from + step, domain.to + step);
				return;
			}
			case "+":
			case "=":
				event.preventDefault();
				setClamped(domain.from + width * 0.2, domain.to - width * 0.2);
				return;
			case "-":
			case "_":
				event.preventDefault();
				setClamped(domain.from - width * 0.3, domain.to + width * 0.3);
				return;
			case "0":
				event.preventDefault();
				setRange(null);
				return;
		}
	};

	const hoverRequest = hover?.request !== null && hover?.request !== undefined ? requests[hover.request] : null;

	return (
		<section aria-label="Timeline overview" className="surface-ink film-grid relative shrink-0 select-none border-b border-(--rule) bg-ink px-4 pb-1.5 pt-2 sm:px-5">
			<div className="mb-1 flex items-center justify-between gap-4">
				<p className="label-sm flex items-center gap-2 text-(--muted)">
					<span className="text-(--fg)">Exposure</span>
					<span className="hidden sm:inline">· drag to zoom · click a line to inspect</span>
				</p>
				<div className="label-sm flex items-center gap-3 text-(--muted) tnum">
					{zoomed ? (
						<>
							<span>
								{formatMs(domain.from)} to {formatMs(domain.to)}
							</span>
							<button type="button" onClick={() => setRange(null)} className="text-signal hover:underline">
								Reset zoom
							</button>
						</>
					) : (
						<span>{formatMs(report.summary.duration)} · {requests.length} requests</span>
					)}
				</div>
			</div>

			<div
				ref={wrapRef}
				tabIndex={0}
				role="group"
				aria-roledescription="timeline brush"
				aria-label={`Timeline overview, ${zoomed ? `zoomed to ${formatMs(domain.from)} to ${formatMs(domain.to)}` : "showing everything"}. Drag to zoom. Arrow keys pan, plus and minus zoom, 0 resets.`}
				onPointerDown={(event) => onPointerDown(event, "new")}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerLeave={() => setHover(null)}
				onDoubleClick={() => setRange(null)}
				onKeyDown={onKeyDown}
				className="relative cursor-crosshair rounded-[2px] outline-offset-4"
				style={{ height: HEIGHT }}
			>
				<canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />

				{markers.map((marker) => (
					<div key={marker.label} aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: `${pct(marker.at)}%` }}>
						<span className={`absolute inset-y-0 w-px border-l border-dashed ${marker.hot ? "border-signal/80" : "border-paper/45"}`} />
						<span className={`label-sm absolute -top-0.5 left-1 whitespace-nowrap ${marker.hot ? "text-signal" : "text-(--muted)"}`}>{marker.label}</span>
					</div>
				))}

				{zoomed ? (
					<>
						<div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 bg-ink/70" style={{ width: `${pct(domain.from)}%` }} />
						<div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 bg-ink/70" style={{ width: `${100 - pct(domain.to)}%` }} />
						<div
							className="absolute inset-y-0 cursor-grab border-x border-signal bg-signal/[0.06] active:cursor-grabbing"
							style={{ left: `${pct(domain.from)}%`, width: `${pct(domain.to) - pct(domain.from)}%` }}
							onPointerDown={(event) => onPointerDown(event, "move")}
						>
							<span
								aria-hidden
								onPointerDown={(event) => onPointerDown(event, "start")}
								className="absolute -left-1.5 top-1/2 h-6 w-3 -translate-y-1/2 cursor-ew-resize rounded-[2px] border border-signal bg-ink"
							/>
							<span
								aria-hidden
								onPointerDown={(event) => onPointerDown(event, "end")}
								className="absolute -right-1.5 top-1/2 h-6 w-3 -translate-y-1/2 cursor-ew-resize rounded-[2px] border border-signal bg-ink"
							/>
						</div>
					</>
				) : null}

				{hover && !dragging ? (
					<div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: hover.x }}>
						<span className="absolute inset-y-0 w-px bg-paper/40" />
						<span
							className={`label-sm absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-[2px] bg-ink-3 px-1.5 py-0.5 text-(--fg) ${
								hover.x > width - 220 ? "right-2" : "left-2"
							}`}
						>
							{formatMs(hover.ms)}
							{hoverRequest ? <span className="normal-case tracking-normal text-(--muted)"> · {hoverRequest.name.slice(0, 40)}</span> : null}
						</span>
					</div>
				) : null}
			</div>

			<div aria-hidden className="relative mt-1 h-3.5">
				{ticks.map((tick) => (
					<span
						key={tick}
						className={`label-sm absolute whitespace-nowrap text-[0.5625rem] text-(--muted) ${tick === 0 ? "" : pct(tick) > 95 ? "-translate-x-full" : "-translate-x-1/2"}`}
						style={{ left: `${pct(tick)}%` }}
					>
						{formatTick(tick)}
					</span>
				))}
			</div>
		</section>
	);
}
