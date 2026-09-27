"use client";

import { useState, type ReactNode } from "react";
import { formatCount } from "@/lib/format";
import type { BatchPart } from "@/lib/odata/batch";
import { linesToText, type Line } from "@/lib/odata/filter";
import type { ExpandItem } from "@/lib/odata/query";
import type { ODataDetail } from "@/lib/worker/detail";
import { ChevronDown, ChevronRight } from "../ui/icons";
import { MethodTag } from "../ui/marks";
import { CodeView } from "./code-view";
import { CopyButton } from "./copy-button";

function Section({ name, meta, children }: { name: string; meta?: ReactNode; children: ReactNode }) {
	return (
		<section className="border-t border-(--rule) pt-3">
			<div className="mb-2 flex items-baseline justify-between gap-3">
				<h3 className="font-mono text-[0.8125rem] font-medium text-(--accent)">{name}</h3>
				{meta ? <span className="label-sm text-(--muted)">{meta}</span> : null}
			</div>
			{children}
		</section>
	);
}

function FilterLines({ lines }: { lines: Line[] }) {
	return (
		<pre className="code m-0 overflow-x-auto rounded-[3px] border border-(--rule) bg-paper-2/50 px-3 py-2.5 leading-[1.75]">
			{lines.map((line, index) => (
				<div key={index} style={{ paddingLeft: `${line.indent * 1.5}rem` }}>
					{line.parts.map((part, i) => (
						<span key={i} className={`tok-${part.kind}`}>
							{part.text}
						</span>
					))}
				</div>
			))}
		</pre>
	);
}

function ExpandTree({ items, depth = 0 }: { items: ExpandItem[]; depth?: number }) {
	return (
		<ul className={depth ? "ml-3 border-l border-(--rule) pl-3" : ""}>
			{items.map((item, index) => (
				<li key={`${item.path}-${index}`} className="py-1">
					<p className="font-mono text-[0.75rem]">
						<span className="text-(--muted)">{depth ? "└ " : ""}</span>
						<span className="font-medium">{item.path}</span>
					</p>
					{item.select.length || item.options.length ? (
						<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-3 font-mono text-[0.6875rem] text-(--muted)">
							{item.select.length ? (
								<span>
									<span className="text-(--accent)">$select</span> {item.select.join(", ")}
								</span>
							) : null}
							{item.options.map((option) => (
								<span key={option.name}>
									<span className="text-(--accent)">{option.name}</span> {option.value}
								</span>
							))}
						</div>
					) : null}
					{item.expand.length ? <ExpandTree items={item.expand} depth={depth + 1} /> : null}
				</li>
			))}
		</ul>
	);
}

function BatchParts({ requests, responses }: { requests: BatchPart[] | null; responses: BatchPart[] | null }) {
	const [open, setOpen] = useState<number | null>(null);
	const count = Math.max(requests?.length ?? 0, responses?.length ?? 0);
	return (
		<ol className="border-t border-(--rule)">
			{Array.from({ length: count }, (_, index) => {
				const req = requests?.[index];
				const res = responses?.[index];
				const bad = (res?.status ?? 0) >= 400;
				return (
					<li key={index} className="border-b border-(--rule)">
						<button
							type="button"
							aria-expanded={open === index}
							onClick={() => setOpen(open === index ? null : index)}
							className="grid w-full grid-cols-[1rem_1.5rem_3.25rem_1fr_auto] items-baseline gap-2 py-1.5 text-left hover:bg-(--hover)"
						>
							<span className="text-(--muted)">{open === index ? <ChevronDown /> : <ChevronRight />}</span>
							<span className="font-mono text-[0.6875rem] text-(--muted)">{index + 1}</span>
							<MethodTag method={req?.method ?? "?"} />
							<span className="truncate font-mono text-[0.75rem]" title={req?.url ?? ""}>
								{req?.url ?? "(unknown)"}
								{req?.group ? <span className="text-(--muted)"> · changeset</span> : null}
							</span>
							<span className={`font-mono text-[0.6875rem] tnum ${bad ? "font-medium text-signal-deep" : "text-(--muted)"}`}>{res?.status ?? ""}</span>
						</button>
						{open === index ? (
							<div className="grid gap-3 pb-3 pl-6">
								{req?.body ? <CodeView text={req.body} json={/^\s*[{[]/.test(req.body)} label="Part request" maxHeight="14rem" /> : null}
								{res?.body ? <CodeView text={res.body} json={/^\s*[{[]/.test(res.body)} label={`Part response ${res.status ?? ""}`} maxHeight="14rem" /> : null}
								{!req?.body && !res?.body ? <p className="text-[0.8125rem] text-(--muted)">No body in this part.</p> : null}
							</div>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}

export function ODataPanel({ odata }: { odata: ODataDetail }) {
	const { query } = odata;
	const [raw, setRaw] = useState(false);
	const isBatch = odata.batchRequest !== null || odata.batchResponse !== null;

	return (
		<div className="grid gap-5">
			<section>
				<h3 className="label mb-2 text-(--muted)">Resource path</h3>
				<p className="flex flex-wrap items-center gap-1 font-mono text-[0.75rem]">
					{query.segments.map((segment, index) => (
						<span key={index} className="inline-flex items-center gap-1">
							{index ? <span className="text-(--muted)">/</span> : null}
							<span className="rounded-[2px] bg-(--chip) px-1.5 py-0.5">
								{segment.name}
								{segment.key !== null ? <span className="text-(--accent)">({segment.key})</span> : null}
							</span>
						</span>
					))}
				</p>
			</section>

			{query.filter ? (
				<Section
					name="$filter"
					meta={
						<span className="flex items-center gap-2">
							<button type="button" onClick={() => setRaw(!raw)} className="hover:text-(--fg)" aria-pressed={raw}>
								{raw ? "Formatted" : "Raw"}
							</button>
							<CopyButton value={query.filter.lines && !raw ? linesToText(query.filter.lines) : query.filter.raw} />
						</span>
					}
				>
					{query.filter.lines && !raw ? (
						<FilterLines lines={query.filter.lines} />
					) : (
						<pre className="code m-0 whitespace-pre-wrap break-all rounded-[3px] border border-(--rule) bg-paper-2/50 px-3 py-2.5">{query.filter.raw}</pre>
					)}
					{query.filter.english ? (
						<p className="mt-3 text-[0.8125rem] text-(--muted)">
							<span className="label-sm mr-2">Reads as</span>
							<span className="serif text-[1.1875rem] italic leading-snug text-(--fg)">{query.filter.english}</span>
						</p>
					) : null}
					{query.filter.error ? <p className="mt-2 font-mono text-[0.6875rem] text-signal-deep">Couldn&apos;t parse: {query.filter.error}</p> : null}
				</Section>
			) : null}

			{query.select ? (
				<Section name="$select" meta={`${query.select.length} ${query.select.length === 1 ? "field" : "fields"}`}>
					<div className="flex flex-wrap gap-1.5">
						{query.select.map((field) => (
							<span key={field} className="rounded-[2px] border border-(--rule) px-1.5 py-0.5 font-mono text-[0.71875rem]">
								{field}
							</span>
						))}
					</div>
				</Section>
			) : null}

			{query.expand ? (
				<Section name="$expand" meta={`${query.expand.length} ${query.expand.length === 1 ? "relation" : "relations"}`}>
					<ExpandTree items={query.expand} />
				</Section>
			) : null}

			{query.orderby ? (
				<Section name="$orderby">
					<ol className="grid gap-1">
						{query.orderby.map((item, index) => (
							<li key={index} className="flex items-baseline gap-2 font-mono text-[0.75rem]">
								<span className="text-(--muted)">{index + 1}.</span>
								<span>{item.expression}</span>
								<span className="label-sm text-(--muted)">{item.direction === "desc" ? "↓ descending" : "↑ ascending"}</span>
							</li>
						))}
					</ol>
				</Section>
			) : null}

			{query.top !== null || query.skip !== null || query.count !== null ? (
				<Section name="Paging">
					<dl className="grid grid-cols-3 gap-3 font-mono text-[0.75rem]">
						<div>
							<dt className="label-sm text-(--muted)">$top</dt>
							<dd className="mt-1">{query.top ?? "none"}</dd>
						</div>
						<div>
							<dt className="label-sm text-(--muted)">$skip</dt>
							<dd className="mt-1">{query.skip ?? 0}</dd>
						</div>
						<div>
							<dt className="label-sm text-(--muted)">$count</dt>
							<dd className="mt-1">{query.count === null ? "not asked" : String(query.count)}</dd>
						</div>
					</dl>
					{query.paging ? <p className="mt-2 text-[0.8125rem] text-(--muted)">{query.paging}</p> : null}
				</Section>
			) : null}

			{query.search ? (
				<Section name="$search">
					<p className="font-mono text-[0.75rem]">{query.search}</p>
				</Section>
			) : null}

			{query.system.length || query.custom.length ? (
				<Section name="Other parameters">
					<dl className="font-mono text-[0.71875rem]">
						{[...query.system, ...query.custom].map((param) => (
							<div key={param.name} className="grid grid-cols-[minmax(6rem,35%)_1fr] gap-3 border-b border-(--rule) py-1">
								<dt className={param.name.startsWith("$") ? "text-(--accent)" : "text-(--muted)"}>{param.name}</dt>
								<dd className="break-all">{param.value}</dd>
							</div>
						))}
					</dl>
				</Section>
			) : null}

			{isBatch ? (
				<Section name="$batch" meta={`${Math.max(odata.batchRequest?.length ?? 0, odata.batchResponse?.length ?? 0)} parts`}>
					<BatchParts requests={odata.batchRequest} responses={odata.batchResponse} />
				</Section>
			) : null}

			{odata.context || odata.items !== null || odata.count !== null ? (
				<Section name="Response">
					<dl className="grid gap-1.5 font-mono text-[0.71875rem]">
						{odata.items !== null ? (
							<div className="flex gap-3">
								<dt className="w-24 shrink-0 text-(--muted)">Returned</dt>
								<dd>
									{formatCount(odata.items)} {odata.items === 1 ? "item" : "items"}
									{odata.count !== null ? ` of ${formatCount(odata.count)}` : ""}
								</dd>
							</div>
						) : null}
						{odata.context ? (
							<div className="flex gap-3">
								<dt className="w-24 shrink-0 text-(--muted)">Context</dt>
								<dd className="min-w-0 break-all">{odata.context}</dd>
							</div>
						) : null}
						{odata.nextLink ? (
							<div className="flex gap-3">
								<dt className="w-24 shrink-0 text-(--muted)">Next page</dt>
								<dd className="min-w-0 break-all">{odata.nextLink}</dd>
							</div>
						) : null}
					</dl>
				</Section>
			) : null}
		</div>
	);
}
