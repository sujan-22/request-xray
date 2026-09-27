"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RULE_INFO } from "@/lib/analysis/rule-info";
import { formatMs, truncateMiddle } from "@/lib/format";
import type { Finding } from "@/lib/model";
import { ChevronLeft, ChevronRight, Compare, Sliders, Target } from "../ui/icons";
import { MethodTag, SeverityMark, SeverityTag, StatusTag } from "../ui/marks";
import { Rug } from "../ui/rug";
import { useWorkspace } from "./context";
import { impactLabel } from "./impact";

interface FindingsRailProps {
	open: boolean;
	onToggle: () => void;
	onSettings: () => void;
	className?: string;
}

const PAGE = 150;

export function FindingsRail({ open, onToggle, onSettings, className = "" }: FindingsRailProps) {
	const { report, activeFinding } = useWorkspace();
	const findings = report.findings;
	const [limit, setLimit] = useState(PAGE);
	const activeIndex = activeFinding ? findings.findIndex((f) => f.id === activeFinding.id) : -1;
	// Stepping with ] past the rendered page reveals more.
	const shown = Math.max(limit, activeIndex + 1);

	if (!open) {
		return (
			<aside aria-label="Findings (collapsed)" className={`surface-paper hidden w-11 shrink-0 flex-col items-center gap-3 border-r border-(--rule) bg-paper-2/40 py-3 lg:flex ${className}`}>
				<button type="button" onClick={onToggle} className="grid size-8 place-items-center rounded-full text-(--muted) hover:bg-(--hover) hover:text-(--fg)" aria-label="Show findings">
					<ChevronRight />
				</button>
				<span className="label-sm text-(--muted) [writing-mode:vertical-rl]">Findings {findings.length}</span>
				<div className="mt-1 flex flex-col gap-1.5">
					{findings.slice(0, 24).map((f) => (
						<SeverityMark key={f.id} severity={f.severity} className={f.id === activeFinding?.id ? "outline outline-2 outline-offset-1 outline-signal" : ""} />
					))}
				</div>
			</aside>
		);
	}

	return (
		<aside aria-label="Findings" className={`surface-paper w-full shrink-0 flex-col border-r border-(--rule) bg-paper lg:w-[23rem] xl:w-[25rem] ${className}`}>
			<div className="hidden items-center justify-between gap-3 border-b border-(--rule) px-4 py-2.5 sm:px-5 lg:flex">
				<h2 className="label flex items-baseline gap-2">
					Findings <span className="text-(--muted)">{findings.length}</span>
				</h2>
				<div className="flex items-center gap-1">
					<span className="label-sm hidden text-(--muted) xl:inline">[ ] to step</span>
					<button type="button" onClick={onToggle} className="hidden size-7 place-items-center rounded-full text-(--muted) hover:bg-(--hover) hover:text-(--fg) lg:grid" aria-label="Collapse findings">
						<ChevronLeft />
					</button>
				</div>
			</div>
			{findings.length ? (
				<ol className="scroll-thin min-h-0 flex-1 overflow-y-auto">
					{findings.slice(0, shown).map((finding, index) => (
						<FindingCard key={finding.id} finding={finding} index={index} />
					))}
					{findings.length > shown ? (
						<li className="px-4 py-4 sm:px-5">
							<button type="button" onClick={() => setLimit(shown + PAGE)} className="label w-full rounded-full border border-(--rule-strong) px-4 py-2.5 hover:border-ink">
								Show {Math.min(PAGE, findings.length - shown)} more of {findings.length - shown}
							</button>
						</li>
					) : null}
				</ol>
			) : (
				<div className="flex flex-1 flex-col items-start gap-4 px-5 py-8">
					<p className="serif text-3xl leading-tight">Nothing stood out.</p>
					<p className="text-(--muted)">No request crossed the current thresholds. Tighten them to look harder.</p>
					<button type="button" onClick={onSettings} className="label inline-flex items-center gap-2 rounded-full border border-(--rule-strong) px-4 py-2 hover:bg-ink hover:text-paper">
						<Sliders /> Adjust thresholds
					</button>
				</div>
			)}
		</aside>
	);
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
	const { activeFinding, setActiveFinding, requests, fullDomain, isolate, setIsolate, select, openCompare, selectedId } = useWorkspace();
	const active = activeFinding?.id === finding.id;
	const ref = useRef<HTMLLIElement>(null);
	const involved = useMemo(() => finding.requestIds.map((id) => requests[id]!).filter(Boolean), [finding.requestIds, requests]);
	const impact = impactLabel(finding);
	const code = `F${String(index + 1).padStart(2, "0")}`;
	const ordered = finding.chain ? finding.chain.map((id) => requests[id]!) : involved;

	useEffect(() => {
		if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
	}, [active]);

	return (
		<li ref={ref} className={`border-b border-(--rule) ${active ? "surface-ink bg-ink" : ""}`}>
			<button
				type="button"
				aria-expanded={active}
				onClick={() => setActiveFinding(active ? null : finding.id)}
				className={`group relative block w-full px-4 pb-3.5 pt-3 text-left transition-colors sm:px-5 ${active ? "" : "hover:bg-(--hover)"}`}
			>
				<span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] bg-signal transition-transform duration-300 ${active ? "scale-y-100" : "scale-y-0"}`} />
				<div className="flex items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2.5">
						<span className="label-sm text-(--muted)">{code}</span>
						<span className="label-sm truncate text-(--muted)">{RULE_INFO[finding.rule].label}</span>
					</div>
					{impact ? (
						<span className="flex shrink-0 items-baseline gap-1.5">
							<span className={`font-mono text-[0.8125rem] font-medium tnum ${active ? "text-signal" : "text-(--accent)"}`}>{impact.value}</span>
							<span className="label-sm text-(--muted)">{impact.caption}</span>
						</span>
					) : null}
				</div>
				<p className="mt-2 truncate font-mono text-[0.75rem] text-(--muted)" title={finding.subject}>
					{truncateMiddle(finding.subject, 90)}
				</p>
				<p className="mt-0.5 text-[0.9375rem] font-medium leading-snug">{finding.title}</p>
				<div className="mt-2.5 flex items-center gap-3">
					<SeverityTag severity={finding.severity} className={`w-14 shrink-0 ${active ? "" : "text-(--muted)"}`} />
					<Rug requests={involved} from={fullDomain.from} to={fullDomain.to} tone={active ? "#ff4d17" : "currentColor"} className={active ? "text-signal" : "text-ink/70"} height={10} />
				</div>
			</button>

			{active ? (
				<div className="fade-in px-4 pb-5 sm:px-5">
					<p className="text-[0.9375rem] leading-relaxed text-paper/85">{finding.why}</p>
					<p className="mt-3 text-[0.9375rem] leading-relaxed text-(--muted)">
						<span className="label mr-2 text-signal">Fix</span>
						{finding.fix}
					</p>

					<div className="mt-4 flex flex-wrap gap-2">
						<button
							type="button"
							aria-pressed={isolate}
							onClick={() => setIsolate(!isolate)}
							className={`label inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors ${isolate ? "border-signal bg-signal text-ink" : "border-(--rule-strong) hover:border-paper"}`}
						>
							<Target /> {isolate ? "Isolated" : "Isolate"}
						</button>
						{involved.length >= 2 ? (
							<button
								type="button"
								onClick={() => openCompare(ordered[0]!.id, ordered[1]!.id)}
								className="label inline-flex items-center gap-1.5 rounded-full border border-(--rule-strong) px-3 py-1.5 hover:border-paper"
							>
								<Compare /> Compare first two
							</button>
						) : null}
					</div>

					<ol className="mt-4 border-t border-(--rule)" aria-label="Requests in this finding">
						{ordered.slice(0, 8).map((r, i) => (
							<li key={r.id}>
								<button
									type="button"
									onClick={() => select(r.id)}
									className={`grid w-full grid-cols-[1.75rem_2.75rem_1fr_auto] items-baseline gap-2 border-b border-(--rule) py-1.5 text-left hover:bg-(--hover) ${selectedId === r.id ? "bg-(--hover)" : ""}`}
								>
									<span className="font-mono text-[0.6875rem] text-(--muted) tnum">{finding.chain ? `${i + 1}.` : `#${r.id + 1}`}</span>
									<MethodTag method={r.method} />
									<span className="truncate font-mono text-[0.75rem]" title={r.url}>
										{r.name}
									</span>
									<span className="flex items-baseline gap-2 font-mono text-[0.6875rem] tnum text-(--muted)">
										<StatusTag status={r.status} failed={r.failed} />
										{formatMs(r.duration)}
									</span>
								</button>
							</li>
						))}
					</ol>
					{ordered.length > 8 ? (
						<button type="button" onClick={() => setIsolate(true)} className="label mt-2 text-(--muted) hover:text-(--fg)">
							+ {ordered.length - 8} more · isolate to see all
						</button>
					) : null}
				</div>
			) : null}
		</li>
	);
}
