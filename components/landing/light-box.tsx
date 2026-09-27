"use client";

import { useId, useRef, type CSSProperties, type DragEvent } from "react";
import { formatBytes } from "@/lib/format";
import type { LoadState } from "../use-analyzer";
import { ArrowRight, Upload } from "../ui/icons";

/** A faint, unexposed waterfall that sits behind the drop target. */
const GHOST_SPANS: Array<[number, number, number, boolean?]> = [
	[0, 0, 22],
	[1, 20, 9],
	[2, 21, 16],
	[3, 21, 30],
	[4, 22, 12],
	[5, 30, 10],
	[6, 32, 6],
	[7, 36, 12, true],
	[8, 49, 15, true],
	[9, 65, 13, true],
	[10, 38, 9],
	[11, 40, 7],
	[12, 41, 8],
	[13, 42, 6],
	[14, 43, 9],
	[15, 44, 7],
	[16, 52, 38],
	[17, 60, 6],
	[18, 70, 11],
	[19, 83, 9],
];

function Ghost({ lit }: { lit: boolean }) {
	return (
		<svg
			aria-hidden
			viewBox="0 0 100 42"
			preserveAspectRatio="none"
			className={`pointer-events-none absolute inset-x-6 bottom-6 h-[42%] w-[calc(100%-3rem)] transition-opacity duration-700 ${lit ? "opacity-100" : "opacity-60"}`}
		>
			{GHOST_SPANS.map(([row, start, width, hot]) => (
				<rect
					key={row}
					x={start}
					y={row * 2.1}
					width={width}
					height={1.1}
					rx={0.3}
					fill={hot ? "rgb(255 77 23 / 0.32)" : "rgb(238 235 227 / 0.1)"}
				/>
			))}
		</svg>
	);
}

function Corners({ hot }: { hot: boolean }) {
	const color = hot ? "border-signal" : "border-paper/35";
	const base = `absolute size-4 transition-colors duration-300 ${color}`;
	return (
		<>
			<span aria-hidden className={`${base} left-3 top-3 border-l border-t`} />
			<span aria-hidden className={`${base} right-3 top-3 border-r border-t`} />
			<span aria-hidden className={`${base} bottom-3 left-3 border-b border-l`} />
			<span aria-hidden className={`${base} bottom-3 right-3 border-b border-r`} />
		</>
	);
}

const STAGE_LABEL = {
	fetching: "Fetching sample",
	reading: "Reading",
	parsing: "Parsing JSON",
	analyzing: "Analysing",
} as const;

interface LightBoxProps {
	state: LoadState;
	dragging: boolean;
	onFile: (file: File) => void;
	onSample: () => void;
	onDragChange: (dragging: boolean) => void;
}

export function LightBox({ state, dragging, onFile, onSample, onDragChange }: LightBoxProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const hintId = useId();
	const loading = state.status === "loading";
	const error = state.status === "error" ? state : null;

	const percent =
		state.status === "loading" && state.stage === "reading" && state.total > 0 ? Math.min(100, (state.loaded / state.total) * 100) : null;

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		onDragChange(false);
		const file = event.dataTransfer.files[0];
		if (file) onFile(file);
	};

	const status = loading ? "Scanning" : error ? "Rejected" : dragging ? "Release to scan" : "Ready";

	return (
		<figure className="m-0">
			<div
				onDragOver={(event) => {
					event.preventDefault();
					if (!dragging) onDragChange(true);
				}}
				onDragLeave={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node)) onDragChange(false);
				}}
				onDrop={onDrop}
				className={`surface-ink film-grid relative isolate flex min-h-[26rem] w-full flex-col overflow-hidden rounded-[3px] bg-ink sm:aspect-[4/3] sm:min-h-[22rem] shadow-[0_40px_80px_-40px_rgb(17_18_20/0.6)] transition-shadow duration-500 sm:aspect-[4/3] ${
					dragging ? "shadow-[0_0_0_1px_var(--color-signal),0_40px_80px_-30px_rgb(255_77_23/0.45)]" : ""
				}`}
			>
				{/* Backlight: warms up when a file is over the plate. */}
				<div
					aria-hidden
					className={`pointer-events-none absolute inset-0 -z-10 transition-opacity duration-500 ${dragging ? "opacity-100" : "opacity-0"}`}
					style={{ background: "radial-gradient(120% 90% at 50% 45%, rgb(238 235 227 / 0.13), transparent 60%)" }}
				/>
				<Corners hot={dragging || loading} />
				<Ghost lit={dragging || loading} />

				<div className="relative flex items-center justify-between gap-4 px-6 pt-5">
					<div className="label flex items-center gap-2.5 text-(--muted)">
						<span className={`relative inline-block size-1.5 rounded-full ${loading || dragging ? "ping bg-signal" : error ? "bg-signal" : "bg-paper/50"}`} aria-hidden />
						Plate 01 · HAR
					</div>
					<span className={`label ${loading || dragging ? "text-signal" : error ? "text-signal" : "text-(--muted)"}`}>{status}</span>
				</div>

				{loading ? (
					<Scanning state={state} percent={percent} />
				) : (
					<div className="relative flex flex-1 flex-col items-center justify-center px-6 pb-[18%] text-center">
						{error ? (
							<div role="alert" className="max-w-md">
								<p className="label text-signal">Couldn&apos;t read {error.name}</p>
								<p className="serif mt-3 text-[1.75rem] leading-tight sm:text-[2rem]">{error.error.message}</p>
								{error.error.detail ? <p className="mt-3 font-mono text-xs leading-relaxed text-(--muted)">{error.error.detail}</p> : null}
							</div>
						) : (
							<>
								<p className="serif text-[2.5rem] leading-none sm:text-[3.25rem]">
									{dragging ? (
										<em>Release to scan</em>
									) : (
										<>
											Drop a <em className="text-signal">.har</em> file
										</>
									)}
								</p>
								<p id={hintId} className="label mt-4 text-(--muted)">
									Any size · Parsed on this device
								</p>
							</>
						)}
						<div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
							<button
								type="button"
								onClick={() => inputRef.current?.click()}
								aria-describedby={hintId}
								className="group inline-flex items-center gap-2.5 rounded-full bg-paper px-5 py-3 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-signal"
							>
								<Upload className="transition-transform duration-500 group-hover:-translate-y-0.5" />
								{error ? "Choose another file" : "Choose a file"}
							</button>
							<button type="button" onClick={onSample} className="group inline-flex items-center gap-2 text-[0.9375rem] text-(--fg)">
								<span className="link-underline">Try the sample storefront</span>
								<ArrowRight className="transition-transform duration-500 group-hover:translate-x-0.5" />
							</button>
						</div>
					</div>
				)}

				<input
					ref={inputRef}
					type="file"
					accept=".har,.json,application/json"
					className="sr-only"
					tabIndex={-1}
					aria-hidden
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) onFile(file);
						event.target.value = "";
					}}
				/>
			</div>
			<figcaption className="label mt-4 flex flex-wrap justify-between gap-2 text-mute">
				<span>Fig. 1: The light box. Drop a capture anywhere on this page.</span>
				<span className="hidden sm:inline">⌘O / Ctrl+O to open</span>
			</figcaption>
		</figure>
	);
}

function Scanning({ state, percent }: { state: Extract<LoadState, { status: "loading" }>; percent: number | null }) {
	const determinate = percent !== null;
	const lineStyle = { left: `${percent ?? 0}%` } as CSSProperties;
	return (
		<div className="relative flex flex-1 flex-col items-center justify-center px-6 pb-[14%]" role="status" aria-live="polite">
			{/* Exposed area and scan line */}
			{determinate ? (
				<>
					<div aria-hidden className="absolute inset-y-0 left-0 bg-paper/[0.035] transition-[width] duration-150" style={{ width: `${percent}%` }} />
					<div aria-hidden className="absolute inset-y-0 w-px bg-signal shadow-[0_0_18px_3px_rgb(255_77_23/0.55)] transition-[left] duration-150" style={lineStyle} />
				</>
			) : (
				<div aria-hidden className="absolute inset-0 overflow-hidden">
					<div className="scan-idle absolute inset-y-0 w-full">
						<div className="absolute inset-y-0 right-0 w-px bg-signal shadow-[0_0_18px_3px_rgb(255_77_23/0.55)]" />
						<div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-paper/[0.06] to-transparent" />
					</div>
				</div>
			)}
			<p className="relative max-w-full truncate font-mono text-sm text-(--muted)">{state.name}</p>
			<p className="relative mt-3 font-mono text-[3.5rem] leading-none tnum sm:text-[4.5rem]">
				{determinate ? `${Math.floor(percent)}%` : <span className="caret">{STAGE_LABEL[state.stage]}</span>}
			</p>
			<p className="label relative mt-5 text-signal">
				{STAGE_LABEL[state.stage]}
				{state.stage === "reading" && state.total ? ` · ${formatBytes(state.loaded)} of ${formatBytes(state.total)}` : ""}
			</p>
		</div>
	);
}
