/** Number formatting shared by the UI and the exports. Decimal units, like DevTools. */

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
	if (bytes < 1000) return `${Math.round(bytes)} B`;
	if (bytes < 1000 * 1000) {
		const kb = bytes / 1000;
		return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} kB`;
	}
	const mb = bytes / (1000 * 1000);
	return `${mb < 10 ? mb.toFixed(2) : mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function formatMs(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "n/a";
	if (ms < 1) return ms === 0 ? "0 ms" : "<1 ms";
	if (ms < 1000) return `${Math.round(ms)} ms`;
	if (ms < 10_000) return `${(ms / 1000).toFixed(2)} s`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1000);
	return `${minutes} m ${seconds} s`;
}

export function formatCount(value: number): string {
	return value.toLocaleString("en-US");
}

export function plural(count: number, one: string, many = `${one}s`): string {
	return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/** Ticks for a time axis: 4–7 round values between 0 and `span`. */
export function timeTicks(from: number, to: number, target = 6): number[] {
	const span = Math.max(1, to - from);
	const raw = span / target;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= target + 1) ?? 10 * magnitude;
	const ticks: number[] = [];
	for (let t = Math.ceil(from / step) * step; t <= to + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
	return ticks;
}

/** Axis labels: "0", "250 ms", "1.5 s". */
export function formatTick(ms: number): string {
	if (ms === 0) return "0";
	if (Math.abs(ms) < 1000) return `${Math.round(ms)} ms`;
	const s = ms / 1000;
	return `${Number.isInteger(s) ? s : s.toFixed(s < 10 ? 2 : 1).replace(/0+$/, "").replace(/\.$/, "")} s`;
}

export function truncateMiddle(value: string, max: number): string {
	if (value.length <= max) return value;
	const keep = max - 1;
	const head = Math.ceil(keep * 0.6);
	return `${value.slice(0, head)}…${value.slice(value.length - (keep - head))}`;
}
