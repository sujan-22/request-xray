"use client";

import type { RefObject } from "react";
import { RESOURCE_TYPES, type ResourceType } from "@/lib/model";
import { TYPE_META } from "@/lib/palette";
import { Close, Search, Target } from "../ui/icons";
import { TypeSwatch } from "../ui/marks";
import { useWorkspace } from "./context";
import type { View } from "./workspace";

interface ToolbarProps {
	view: View;
	onView: (view: View) => void;
	query: string;
	onQuery: (query: string) => void;
	types: ResourceType[];
	onTypes: (types: ResourceType[]) => void;
	searchRef: RefObject<HTMLInputElement | null>;
}

export function Toolbar({ view, onView, query, onQuery, types, onTypes, searchRef }: ToolbarProps) {
	const { report, activeFinding, isolate, setIsolate } = useWorkspace();
	const counts = report.summary.byType;

	const toggleType = (type: ResourceType) => {
		onTypes(types.includes(type) ? types.filter((t) => t !== type) : [...types, type]);
	};

	return (
		<div className="surface-paper shrink-0 border-b border-(--rule) bg-paper">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pt-2 sm:px-4">
				<div role="tablist" aria-label="View" className="flex">
					{(
						[
							["waterfall", "Waterfall", report.requests.length, "1"],
							["endpoints", "Endpoints", report.endpoints.length, "2"],
						] as const
					).map(([id, label, count, key]) => (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={view === id}
							onClick={() => onView(id)}
							title={`${label} (${key})`}
							className={`relative px-2.5 py-2 text-[0.875rem] font-medium transition-colors ${view === id ? "text-(--fg)" : "text-(--muted) hover:text-(--fg)"}`}
						>
							{label} <span className="font-mono text-[0.75rem] text-(--muted) tnum">{count}</span>
							<span aria-hidden className={`absolute inset-x-2.5 -bottom-px h-[2px] origin-left bg-signal transition-transform duration-300 ${view === id ? "scale-x-100" : "scale-x-0"}`} />
						</button>
					))}
				</div>

				<label className="relative ml-auto flex min-w-[12rem] flex-1 items-center sm:max-w-[26rem]">
					<span className="sr-only">Filter requests</span>
					<Search className="pointer-events-none absolute left-2.5 text-(--muted)" />
					<input
						ref={searchRef}
						type="search"
						value={query}
						onChange={(event) => onQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								onQuery("");
								event.currentTarget.blur();
							}
						}}
						placeholder="Filter: text, method:post, status:4xx, type:api, larger:100kb"
						spellCheck={false}
						className="h-8 w-full rounded-full border border-(--rule-strong) bg-paper pl-8 pr-8 font-mono text-[0.75rem] placeholder:text-(--muted)/80 focus:border-ink focus:outline-none"
					/>
					{query ? (
						<button type="button" onClick={() => onQuery("")} className="absolute right-2 grid size-5 place-items-center text-(--muted) hover:text-(--fg)" aria-label="Clear filter">
							<Close />
						</button>
					) : (
						<kbd className="label-sm pointer-events-none absolute right-3 text-(--muted)">/</kbd>
					)}
				</label>
			</div>

			<div className="scroll-thin flex items-center gap-1.5 overflow-x-auto px-3 pb-2 pt-1.5 sm:px-4" role="group" aria-label="Resource types">
				{RESOURCE_TYPES.filter((type) => counts[type].count > 0).map((type) => {
					const on = types.includes(type);
					return (
						<button
							key={type}
							type="button"
							aria-pressed={on}
							onClick={() => toggleType(type)}
							title={TYPE_META[type].label}
							className={`label-sm inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
								on ? "border-ink bg-ink text-paper" : types.length ? "border-(--rule) text-(--muted) hover:border-(--rule-strong)" : "border-(--rule) hover:border-(--rule-strong)"
							}`}
						>
							<TypeSwatch type={type} onInk={on} />
							{TYPE_META[type].short}
							<span className={on ? "text-paper/60" : "text-(--muted)"}>{counts[type].count}</span>
						</button>
					);
				})}
				{types.length ? (
					<button type="button" onClick={() => onTypes([])} className="label-sm shrink-0 px-2 text-(--muted) hover:text-(--fg)">
						Clear
					</button>
				) : null}
				{activeFinding ? (
					<button
						type="button"
						aria-pressed={isolate}
						onClick={() => setIsolate(!isolate)}
						className={`label-sm ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
							isolate ? "border-signal bg-signal text-ink" : "border-signal/60 text-signal-deep hover:border-signal"
						}`}
						title="Show only this finding's requests (I)"
					>
						<Target /> {isolate ? "Isolated" : "Isolate finding"}
					</button>
				) : null}
			</div>
		</div>
	);
}
