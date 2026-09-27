import { memo } from "react";
import type { RequestRecord } from "@/lib/model";

interface RugProps {
	requests: readonly RequestRecord[];
	from: number;
	to: number;
	/** Colour for the marks; currentColor by default. */
	tone?: string;
	highlight?: ReadonlySet<number> | null;
	className?: string;
	height?: number;
}

const WIDTH = 1000;
/** Past this many requests, draw a density strip instead of one mark each. */
const BIN_AFTER = 300;
const BINS = 250;

/** A one-line timeline: each request as a tick at its start, as wide as its duration. */
export const Rug = memo(function Rug({ requests, from, to, tone = "currentColor", highlight, className = "", height = 12 }: RugProps) {
	const span = Math.max(1e-6, to - from);
	const x = (ms: number) => ((ms - from) / span) * WIDTH;

	let marks: Array<{ key: string | number; x: number; w: number; hot: boolean; opacity: number }>;
	if (requests.length > BIN_AFTER) {
		// Density: how many requests are in flight in each slice of the timeline.
		const counts = new Float64Array(BINS);
		const hot = new Uint8Array(BINS);
		for (const r of requests) {
			const a = Math.max(0, Math.min(BINS - 1, Math.floor((x(r.start) / WIDTH) * BINS)));
			const b = Math.max(a, Math.min(BINS - 1, Math.floor((x(r.end) / WIDTH) * BINS)));
			for (let i = a; i <= b; i++) {
				counts[i]!++;
				if (highlight?.has(r.id)) hot[i] = 1;
			}
		}
		let max = 0;
		for (const c of counts) max = Math.max(max, c);
		marks = [];
		counts.forEach((count, i) => {
			if (!count) return;
			marks.push({ key: i, x: (i / BINS) * WIDTH, w: WIDTH / BINS + 0.5, hot: hot[i] === 1, opacity: 0.25 + 0.75 * (count / max) });
		});
	} else {
		marks = requests.map((r) => ({ key: r.id, x: x(r.start), w: Math.max(2.5, x(r.end) - x(r.start)), hot: highlight?.has(r.id) ?? false, opacity: 0.8 }));
	}

	return (
		<svg aria-hidden viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" className={`block w-full ${className}`} style={{ height }}>
			<line x1="0" x2={WIDTH} y1={height / 2} y2={height / 2} stroke="currentColor" strokeOpacity="0.14" vectorEffect="non-scaling-stroke" />
			{marks.map((m) => (
				<rect key={m.key} x={m.x} y={2} width={m.w} height={height - 4} fill={m.hot ? "#ff4d17" : tone} fillOpacity={m.hot ? 1 : m.opacity} />
			))}
		</svg>
	);
});
