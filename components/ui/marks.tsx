import type { CSSProperties } from "react";
import type { ResourceType, Severity } from "@/lib/model";
import { SEVERITY_META, TYPE_META } from "@/lib/palette";

/**
 * Severity is shape-coded as well as coloured, so it reads without colour:
 * high = solid square, medium = half-filled, low = outline.
 */
export function SeverityMark({ severity, className = "" }: { severity: Severity; className?: string }) {
	const fill =
		severity === "high"
			? "bg-signal border-signal"
			: severity === "medium"
				? "border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]"
				: "border-current bg-transparent";
	return <span aria-hidden className={`inline-block size-[9px] shrink-0 border-[1.5px] ${fill} ${className}`} />;
}

export function SeverityTag({ severity, className = "" }: { severity: Severity; className?: string }) {
	return (
		<span className={`label-sm inline-flex items-center gap-1.5 ${className}`}>
			<SeverityMark severity={severity} />
			{SEVERITY_META[severity].short}
			<span className="sr-only"> severity</span>
		</span>
	);
}

export function TypeSwatch({ type, className = "", onInk = false }: { type: ResourceType; className?: string; onInk?: boolean }) {
	const meta = TYPE_META[type];
	const style = { background: onInk ? meta.onInk : meta.color } as CSSProperties;
	return <span aria-hidden className={`inline-block h-[7px] w-3 shrink-0 rounded-[1px] ${className}`} style={style} />;
}

export function MethodTag({ method, className = "" }: { method: string; className?: string }) {
	const tone = method === "GET" || method === "OPTIONS" ? "text-(--muted)" : "text-(--fg)";
	return <span className={`font-mono text-[0.6875rem] font-medium tracking-wide ${tone} ${className}`}>{method}</span>;
}

export function StatusTag({ status, failed, className = "" }: { status: number; failed: boolean; className?: string }) {
	const bad = failed || status >= 400;
	const text = status === 0 ? "ERR" : String(status);
	return (
		<span className={`font-mono text-[0.6875rem] tnum ${bad ? "font-medium text-signal-deep" : status >= 300 ? "text-(--muted)" : "text-(--muted)"} ${className}`}>
			{text}
		</span>
	);
}
