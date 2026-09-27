"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { RULE_INFO } from "@/lib/analysis/rule-info";
import { formatBytes, formatMs } from "@/lib/format";
import type { RequestRecord, Timings } from "@/lib/model";
import { TYPE_META } from "@/lib/palette";
import type { RequestDetail } from "@/lib/worker/detail";
import { ChevronLeft, ChevronRight, Close, Compare } from "../ui/icons";
import { MethodTag, SeverityMark, StatusTag, TypeSwatch } from "../ui/marks";
import { CodeView } from "./code-view";
import { useWorkspace } from "./context";
import { CopyButton } from "./copy-button";
import { HeadersTable } from "./headers-table";
import { ODataPanel } from "./odata-panel";

type Tab = "overview" | "request" | "response" | "odata";

const PHASES: Array<{ key: keyof Timings; label: string; tone: string }> = [
	{ key: "blocked", label: "Queued / stalled", tone: "bg-ink/25" },
	{ key: "dns", label: "DNS lookup", tone: "bg-type-style" },
	{ key: "connect", label: "Connect", tone: "bg-type-font" },
	{ key: "ssl", label: "TLS", tone: "bg-type-image" },
	{ key: "send", label: "Send", tone: "bg-ink/50" },
	{ key: "wait", label: "Waiting (TTFB)", tone: "bg-ink/45" },
	{ key: "receive", label: "Download", tone: "bg-ink" },
];

function TimingBars({ r }: { r: RequestRecord }) {
	const total = Math.max(1e-6, PHASES.reduce((sum, phase) => sum + r.timings[phase.key], 0));
	const dominant = PHASES.reduce((best, phase) => (r.timings[phase.key] > r.timings[best.key] ? phase : best), PHASES[0]!);
	const offsets = PHASES.map((_, index) => PHASES.slice(0, index).reduce((sum, phase) => sum + r.timings[phase.key], 0));
	return (
		<div>
			<div className="mb-2 flex items-baseline justify-between">
				<h3 className="label">Timing</h3>
				<span className="font-mono text-[0.8125rem] font-medium tnum">{formatMs(r.duration)}</span>
			</div>
			<ol className="grid gap-1">
				{PHASES.map((phase, index) => {
					const value = r.timings[phase.key];
					const left = (offsets[index]! / total) * 100;
					const width = (value / total) * 100;
					if (value <= 0) return null;
					const hot = phase.key === dominant.key && value / total > 0.4;
					return (
						<li key={phase.key} className="grid grid-cols-[8.5rem_1fr_4.25rem] items-center gap-2">
							<span className={`text-[0.8125rem] ${hot ? "font-medium" : "text-(--muted)"}`}>{phase.label}</span>
							<span className="relative h-2.5 rounded-[1px] bg-(--chip)">
								<span className={`bar-grow absolute inset-y-0 rounded-[1px] ${hot ? "bg-signal" : phase.tone}`} style={{ left: `${left}%`, width: `max(2px, ${width}%)` }} />
							</span>
							<span className={`text-right font-mono text-[0.75rem] tnum ${hot ? "font-medium text-(--accent)" : "text-(--muted)"}`}>{formatMs(value)}</span>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-(--rule) py-1.5">
			<dt className="label-sm pt-0.5 text-(--muted)">{label}</dt>
			<dd className="min-w-0 break-words font-mono text-[0.75rem]">{children}</dd>
		</div>
	);
}

function header(detail: RequestDetail | null, name: string): string | undefined {
	return detail?.responseHeaders.find((h) => h.name.toLowerCase() === name)?.value;
}

export function Inspector({ id }: { id: number }) {
	const { requests, select, getDetail, findingsByRequest, setActiveFinding, activeFinding, openCompare, report } = useWorkspace();
	const r = requests[id]!;
	const [tab, setTab] = useState<Tab>("overview");
	const [detail, setDetail] = useState<RequestDetail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const tabsId = useId();
	const findings = findingsByRequest.get(id) ?? [];

	useEffect(() => {
		let cancelled = false;
		getDetail(id).then(
			(value) => !cancelled && setDetail(value),
			(reason: { message?: string }) => !cancelled && setError(reason?.message ?? "Couldn't load this request."),
		);
		return () => {
			cancelled = true;
		};
	}, [id, getDetail]);

	const tabs: Array<{ id: Tab; label: string }> = [
		{ id: "overview", label: "Overview" },
		{ id: "request", label: "Request" },
		{ id: "response", label: "Response" },
		...(r.odata ? [{ id: "odata" as const, label: "OData" }] : []),
	];

	const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
		const index = tabs.findIndex((t) => t.id === tab);
		const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const next = tabs[(index + step + tabs.length) % tabs.length]!;
		setTab(next.id);
		document.getElementById(`${tabsId}-${next.id}`)?.focus();
	};

	const started = report.pages[0] ? r.start - report.pages[0].start : r.start;

	return (
		<aside
			aria-label={`Request ${r.id + 1}: ${r.method} ${r.name}`}
			className="surface-paper slide-in fixed inset-0 z-40 flex flex-col bg-paper shadow-[-30px_0_60px_-30px_rgb(17_18_20/0.35)] lg:absolute lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[30rem] lg:border-l lg:border-(--rule-strong) min-[1600px]:static min-[1600px]:w-[32rem] min-[1600px]:shadow-none"
		>
			<header className="shrink-0 border-b border-(--rule) px-4 pb-3 pt-3 sm:px-5">
				<div className="flex items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2.5">
						<span className="label-sm text-(--muted)">#{r.id + 1}</span>
						<TypeSwatch type={r.type} />
						<MethodTag method={r.method} />
						<StatusTag status={r.status} failed={r.failed} />
						<span className="label-sm truncate text-(--muted)">{TYPE_META[r.type].short}</span>
					</div>
					<div className="flex shrink-0 items-center gap-0.5">
						<button type="button" onClick={() => id > 0 && select(id - 1)} disabled={id === 0} className="grid size-7 place-items-center rounded-full text-(--muted) hover:bg-(--hover) hover:text-(--fg) disabled:opacity-30" aria-label="Previous request">
							<ChevronLeft />
						</button>
						<button
							type="button"
							onClick={() => id < requests.length - 1 && select(id + 1)}
							disabled={id === requests.length - 1}
							className="grid size-7 place-items-center rounded-full text-(--muted) hover:bg-(--hover) hover:text-(--fg) disabled:opacity-30"
							aria-label="Next request"
						>
							<ChevronRight />
						</button>
						<button type="button" onClick={() => openCompare(id, null)} className="label-sm ml-1 inline-flex h-7 items-center gap-1.5 rounded-full border border-(--rule-strong) px-2.5 hover:border-ink" title="Compare with another request (C)">
							<Compare /> Compare
						</button>
						<button type="button" onClick={() => select(null)} className="ml-1 grid size-7 place-items-center rounded-full text-(--muted) hover:bg-(--hover) hover:text-(--fg)" aria-label="Close details (Escape)">
							<Close />
						</button>
					</div>
				</div>
				<h2 className="mt-2 break-all text-[1.0625rem] font-semibold leading-snug tracking-tight">{r.name}</h2>
				<UrlLine url={r.url} />
			</header>

			<div role="tablist" aria-label="Request details" onKeyDown={onTabKey} className="flex shrink-0 border-b border-(--rule) px-2 sm:px-3">
				{tabs.map((t) => (
					<button
						key={t.id}
						id={`${tabsId}-${t.id}`}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						aria-controls={`${tabsId}-panel`}
						tabIndex={tab === t.id ? 0 : -1}
						onClick={() => setTab(t.id)}
						className={`label relative px-2.5 py-2.5 transition-colors ${tab === t.id ? "text-(--fg)" : "text-(--muted) hover:text-(--fg)"}`}
					>
						{t.label}
						{t.id === "odata" ? <span className="ml-1 text-(--accent)">●</span> : null}
						<span aria-hidden className={`absolute inset-x-2.5 -bottom-px h-[2px] bg-signal transition-transform ${tab === t.id ? "scale-x-100" : "scale-x-0"}`} />
					</button>
				))}
			</div>

			<div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
				{error ? <p className="text-signal-deep">{error}</p> : null}

				{tab === "overview" ? (
					<div className="grid gap-6">
						{findings.length ? (
							<section>
								<h3 className="label mb-2">In {findings.length === 1 ? "a finding" : `${findings.length} findings`}</h3>
								<ul className="grid gap-1.5">
									{findings.map((f) => (
										<li key={f.id}>
											<button
												type="button"
												onClick={() => setActiveFinding(f.id)}
												className={`flex w-full items-start gap-2.5 rounded-[3px] border px-3 py-2 text-left transition-colors ${activeFinding?.id === f.id ? "border-signal bg-signal/[0.07]" : "border-(--rule) hover:border-(--rule-strong)"}`}
											>
												<SeverityMark severity={f.severity} className="mt-1" />
												<span className="min-w-0">
													<span className="label-sm block text-(--muted)">{RULE_INFO[f.rule].label}</span>
													<span className="text-[0.875rem] leading-snug">{f.title}</span>
												</span>
											</button>
										</li>
									))}
								</ul>
							</section>
						) : null}

						<TimingBars r={r} />

						<dl>
							<Fact label="Started">
								{formatMs(started)} <span className="text-(--muted)">after navigation</span>
							</Fact>
							<Fact label="Host">
								{r.host} {r.firstParty ? null : <span className="text-(--muted)">· third party</span>}
							</Fact>
							<Fact label="Protocol">{r.protocol || "n/a"}</Fact>
							{detail?.serverIP ? <Fact label="Remote">{detail.serverIP}</Fact> : null}
							<Fact label="Transferred">
								{r.fromCache ? `from ${r.fromCache} cache` : r.transferSize >= 0 ? formatBytes(r.transferSize) : "n/a"}
							</Fact>
							<Fact label="Resource">{formatBytes(r.contentSize)}</Fact>
							<Fact label="Compression">{r.encoding ?? <span className="text-(--muted)">none</span>}</Fact>
							<Fact label="Cache-Control">{header(detail, "cache-control") ?? <span className="text-(--muted)">not set</span>}</Fact>
							<Fact label="Content type">{r.mimeType || "n/a"}</Fact>
							{r.priority ? <Fact label="Priority">{r.priority}</Fact> : null}
							<Fact label="Initiator">{r.initiator ?? <span className="text-(--muted)">unknown</span>}</Fact>
							{r.error ? <Fact label="Error">{r.error}</Fact> : null}
							{detail?.redirectURL ? <Fact label="Redirect">{detail.redirectURL}</Fact> : null}
						</dl>

						{detail?.initiatorStack.length ? (
							<details className="group">
								<summary className="label cursor-pointer text-(--muted) hover:text-(--fg)">Initiator stack ({detail.initiatorStack.length})</summary>
								<ol className="mt-2 grid gap-0.5 font-mono text-[0.6875rem] text-(--muted)">
									{detail.initiatorStack.map((line, index) => (
										<li key={index} className="break-all">
											{line}
										</li>
									))}
								</ol>
							</details>
						) : null}
					</div>
				) : null}

				{tab === "request" ? (
					detail ? (
						<div className="grid gap-6">
							{detail.queryParams.length ? <HeadersTable title="Query parameters" rows={detail.queryParams} maskSecrets={false} /> : null}
							{detail.requestBody ? (
								<section>
									<h3 className="label mb-2">Body</h3>
									<CodeView text={detail.requestBody.text} json={detail.requestBody.json} label={detail.requestBody.mimeType || "text"} truncated={detail.requestBody.truncated} fullLength={detail.requestBody.length} />
								</section>
							) : null}
							<HeadersTable title="Request headers" rows={detail.requestHeaders} />
							{detail.requestCookies.length ? <p className="label-sm text-(--muted)">Cookies sent: {detail.requestCookies.length}</p> : null}
						</div>
					) : (
						<Loading />
					)
				) : null}

				{tab === "response" ? (
					detail ? (
						<div className="grid gap-6">
							{detail.image ? (
								<section>
									<h3 className="label mb-2">Preview</h3>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img src={detail.image} alt={`Response image for ${r.name}`} className="max-h-72 max-w-full rounded-[3px] border border-(--rule) bg-[repeating-conic-gradient(#e4e0d5_0_25%,#eeebe3_0_50%)] bg-[length:16px_16px] object-contain" />
								</section>
							) : null}
							{detail.responseBody ? (
								<section>
									<h3 className="label mb-2">Body</h3>
									<CodeView text={detail.responseBody.text} json={detail.responseBody.json} label={detail.responseBody.mimeType || "text"} truncated={detail.responseBody.truncated} fullLength={detail.responseBody.length} />
								</section>
							) : detail.bodyNote ? (
								<p className="rounded-[3px] border border-dashed border-(--rule-strong) px-3 py-3 text-[0.875rem] text-(--muted)">{detail.bodyNote}</p>
							) : null}
							<HeadersTable title="Response headers" rows={detail.responseHeaders} />
						</div>
					) : (
						<Loading />
					)
				) : null}

				{tab === "odata" ? detail?.odata ? <ODataPanel odata={detail.odata} /> : <Loading /> : null}
			</div>
		</aside>
	);
}

function decodeForDisplay(url: string): string {
	try {
		return decodeURI(url).replace(/%24/gi, "$").replace(/%2C/gi, ",").replace(/%3D/gi, "=").replace(/%3B/gi, ";").replace(/%3A/gi, ":").replace(/%2F/gi, "/");
	} catch {
		return url;
	}
}

/** The full URL, decoded for reading and clamped to three lines until expanded. Copy gives the exact original. */
function UrlLine({ url }: { url: string }) {
	const [open, setOpen] = useState(false);
	const text = decodeForDisplay(url);
	const long = text.length > 150;
	return (
		<div className="mt-1 flex items-start gap-2">
			<div className="min-w-0 flex-1">
				<p className={`break-all font-mono text-[0.6875rem] leading-relaxed text-(--muted) ${long && !open ? "line-clamp-3" : ""}`}>{text}</p>
				{long ? (
					<button type="button" onClick={() => setOpen(!open)} className="label-sm mt-0.5 text-(--muted) hover:text-(--fg)">
						{open ? "Less" : "Full URL"}
					</button>
				) : null}
			</div>
			<CopyButton value={url} label="URL" className="shrink-0" />
		</div>
	);
}

function Loading() {
	return (
		<div className="grid gap-2" aria-busy="true" aria-live="polite">
			<span className="sr-only">Loading</span>
			{[70, 90, 55, 80].map((w, i) => (
				<span key={i} className="h-3 rounded-[2px] bg-(--chip) motion-safe:animate-pulse" style={{ width: `${w}%` }} />
			))}
		</div>
	);
}
