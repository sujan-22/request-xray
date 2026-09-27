"use client";

import type { CSSProperties } from "react";
import { RULE_INFO } from "@/lib/analysis/rule-info";
import { DEFAULT_SETTINGS, type RuleId } from "@/lib/model";
import type { LoadState } from "../use-analyzer";
import { ArrowUpRight, Lock, Mark } from "../ui/icons";
import { LightBox } from "./light-box";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

const s = DEFAULT_SETTINGS;
const DEFAULTS: Record<RuleId, string> = {
	duplicate: "2+ identical calls",
	chatty: `${s.chattyMinCalls}+ different ids`,
	sequential: `${s.chainMinLength}+ calls, ≤ ${s.chainGapMs} ms apart`,
	slow: `≥ ${s.slowMs / 1000} s`,
	"large-response": `${s.largeApiKb} kB API · ${s.largeAssetKb / 1000} MB files`,
	"no-compression": "text ≥ 1 kB",
	"no-cache": "scripts, styles, fonts, images",
	errors: "4xx, 5xx, failed",
	"odata-overfetch": "15+ fields, no $select",
};

const FACTS = [
	{ term: "Input", detail: "A HAR export from Chrome, Edge, Firefox or Safari. Any size." },
	{ term: "Output", detail: "Waterfall, endpoints, findings, OData decoding, request diff." },
	{ term: "Privacy", detail: "Parsed in a Web Worker in this tab. Nothing is uploaded." },
];

const STEPS = [
	{ title: "Open the Network panel", body: "In DevTools (F12, or ⌥⌘I on a Mac), open Network and tick Preserve log." },
	{ title: "Record the page", body: "Reload the page and use it the way you normally would. Every request is captured." },
	{
		title: "Export the HAR",
		body: "Click the download arrow in the Network toolbar (Export HAR), or right-click a request and choose Save all as HAR. With content gives the sharpest findings.",
	},
];

interface LandingProps {
	state: LoadState;
	dragging: boolean;
	onFile: (file: File) => void;
	onSample: () => void;
	onDragChange: (dragging: boolean) => void;
}

export function Landing(props: LandingProps) {
	return (
		<div className="surface-paper grain min-h-dvh bg-paper">
			<header className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
				<div className="flex items-center gap-3">
					<Mark className="size-6" />
					<span className="text-[0.9375rem] font-semibold tracking-tight">Request X-ray</span>
					<span className="label hidden text-(--muted) sm:inline">v0.1</span>
				</div>
				<a href="https://sujanrokad.com" className="label group inline-flex items-center gap-1.5 text-(--muted) transition-colors hover:text-(--fg)">
					By Sujan Rokad
					<ArrowUpRight className="transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
				</a>
			</header>

			<main className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-12">
				<section aria-labelledby="hero-title" className="grid gap-12 pt-6 sm:pt-10 lg:grid-cols-12 lg:gap-10 lg:pt-14">
					<div className="min-w-0 lg:col-span-5 lg:pr-4">
						<p className="label rise flex flex-wrap gap-x-5 gap-y-1 text-(--muted)">
							<span className="text-(--fg)">
								<span className="text-(--accent)">●</span> HAR analyzer
							</span>
							<span>Runs in your browser</span>
						</p>
						<h1 id="hero-title" className="display rise mt-6 text-[clamp(3.25rem,11vw,7.75rem)]" style={delay(60)}>
							Request X&#8209;ray
						</h1>
						<p className="serif rise mt-2 text-[clamp(1.9rem,4.2vw,3.25rem)] leading-[1.02]" style={delay(140)}>
							Count the calls. <em className="text-(--accent)">Find the waste.</em>
						</p>
						<p className="rise mt-8 max-w-[34rem] text-lg leading-relaxed" style={delay(220)}>
							Drop the network log from DevTools and see what the page actually did: every request on one timeline, grouped by
							endpoint, with the duplicates, waterfalls and oversized responses called out.{" "}
							<span className="text-(--muted)">OData queries are decoded into something you can read.</span>
						</p>
						<dl className="rise mt-10 border-t border-(--rule)" style={delay(300)}>
							{FACTS.map((fact) => (
								<div key={fact.term} className="grid grid-cols-[5.5rem_1fr] gap-4 border-b border-(--rule) py-3 text-[0.9375rem]">
									<dt className="label pt-[3px] text-(--muted)">{fact.term}</dt>
									<dd>{fact.detail}</dd>
								</div>
							))}
						</dl>
					</div>
					<div className="rise min-w-0 lg:col-span-7" style={delay(200)}>
						<LightBox {...props} />
					</div>
				</section>

				<section aria-labelledby="checks-title" className="mt-24 lg:mt-32">
					<div className="flex items-end justify-between gap-6 border-b border-(--rule-strong) pb-4">
						<h2 id="checks-title" className="display text-[clamp(2rem,4.5vw,3.25rem)]">
							What it looks for
						</h2>
						<p className="label hidden text-(--muted) sm:block">Thresholds are adjustable</p>
					</div>
					<ol className="divide-y divide-(--rule)">
						{(Object.keys(RULE_INFO) as RuleId[]).map((rule, index) => (
							<li key={rule} className="grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-1 py-4 sm:grid-cols-[4rem_13rem_1fr_15rem] sm:items-baseline">
								<span className="font-mono text-xs text-(--accent)">{RULE_INFO[rule].code}</span>
								<span className="font-medium">
									<span className="label mr-2 text-(--muted) sm:hidden">{String(index + 1).padStart(2, "0")}</span>
									{RULE_INFO[rule].label}
								</span>
								<span className="col-start-2 text-(--muted) sm:col-start-auto">{RULE_INFO[rule].checks}</span>
								<span className="label col-start-2 text-(--muted) sm:col-start-auto sm:text-right">{DEFAULTS[rule]}</span>
							</li>
						))}
					</ol>
				</section>

				<section aria-labelledby="howto-title" className="mt-24 grid gap-10 lg:mt-32 lg:grid-cols-12">
					<div className="lg:col-span-4">
						<h2 id="howto-title" className="display text-[clamp(2rem,4.5vw,3.25rem)]">
							Getting a HAR
						</h2>
						<p className="serif mt-4 text-2xl leading-snug text-(--muted)">Thirty seconds in any browser&apos;s DevTools.</p>
					</div>
					<ol className="grid gap-px overflow-hidden rounded-[3px] border border-(--rule) bg-(--rule) sm:grid-cols-3 lg:col-span-8">
						{STEPS.map((step, index) => (
							<li key={step.title} className="bg-paper p-6">
								<span className="font-mono text-sm text-(--accent)">0{index + 1}</span>
								<h3 className="mt-6 text-lg font-semibold tracking-tight">{step.title}</h3>
								<p className="mt-2 leading-relaxed text-(--muted)">{step.body}</p>
							</li>
						))}
					</ol>
				</section>

				<section aria-labelledby="privacy-title" className="surface-ink mt-24 rounded-[3px] bg-ink px-6 py-10 sm:px-10 lg:mt-32 lg:px-14 lg:py-14">
					<div className="grid gap-10 lg:grid-cols-12">
						<div className="lg:col-span-5">
							<p className="label flex items-center gap-2 text-(--muted)">
								<Lock /> Private by design
							</p>
							<h2 id="privacy-title" className="display mt-5 text-[clamp(2rem,4.5vw,3.25rem)]">
								Your file never leaves this tab.
							</h2>
						</div>
						<ul className="grid gap-6 sm:grid-cols-3 lg:col-span-7 lg:pt-2">
							<li>
								<p className="label text-signal">No server</p>
								<p className="mt-3 leading-relaxed text-(--muted)">Parsing and analysis run in a Web Worker on your machine. There is nothing to upload to.</p>
							</li>
							<li>
								<p className="label text-signal">Locked down</p>
								<p className="mt-3 leading-relaxed text-(--muted)">
									The page&apos;s Content Security Policy only allows requests to its own origin, so the browser blocks any attempt to send data elsewhere.
								</p>
							</li>
							<li>
								<p className="label text-signal">Safe to share</p>
								<p className="mt-3 leading-relaxed text-(--muted)">Exports strip auth headers, cookies, tokens and emails before anything is saved.</p>
							</li>
						</ul>
					</div>
				</section>
			</main>

			<footer className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
				<div className="flex flex-wrap items-center justify-between gap-4 border-t border-(--rule) py-8">
					<p className="label text-(--muted)">Request X-ray · Built by Sujan Rokad</p>
					<a href="https://sujanrokad.com" className="label link-underline text-(--muted) hover:text-(--fg)">
						sujanrokad.com
					</a>
				</div>
			</footer>
		</div>
	);
}
