"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Finding, Report, ResourceType } from "@/lib/model";
import type { RequestDetail } from "@/lib/worker/detail";
import type { Analyzer } from "../use-analyzer";
import { WorkspaceContext, type Domain, type WorkspaceContextValue } from "./context";
import { DiffView } from "./diff-view";
import { EndpointsTable } from "./endpoints-table";
import { ExportDialog } from "./export-dialog";
import { Exposure } from "./exposure";
import { FindingsRail } from "./findings-rail";
import { Inspector } from "./inspector";
import { ReportHead } from "./report-head";
import { SettingsDialog } from "./settings-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { Toolbar } from "./toolbar";
import { TopBar } from "./top-bar";
import { Waterfall } from "./waterfall";

export type View = "waterfall" | "endpoints";
type Pane = "findings" | "requests";

/** Keyed by file in XrayApp, so a new capture starts with fresh state and an empty detail cache. */
interface WorkspaceProps {
	analyzer: Analyzer;
	report: Report;
	onOpenFile: () => void;
	dragging: boolean;
}

function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function Workspace({ analyzer, report, onOpenFile, dragging }: WorkspaceProps) {
	const [view, setView] = useState<View>("waterfall");
	const [pane, setPane] = useState<Pane>("findings");
	const [railOpen, setRailOpen] = useState(true);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
	const [isolate, setIsolate] = useState(false);
	const [range, setRange] = useState<Domain | null>(null);
	const [query, setQuery] = useState("");
	const [types, setTypes] = useState<ResourceType[]>([]);
	const [compare, setCompare] = useState<{ a: number | null; b: number | null } | null>(null);
	const [exportOpen, setExportOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [helpOpen, setHelpOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const detailCache = useRef(new Map<number, Promise<RequestDetail>>());

	const activeFinding = useMemo(() => report.findings.find((f) => f.id === activeFindingId) ?? null, [report.findings, activeFindingId]);
	const highlighted = useMemo(() => (activeFinding ? new Set(activeFinding.requestIds) : null), [activeFinding]);

	const fullDomain = useMemo<Domain>(() => {
		const end = Math.max(report.summary.duration, report.summary.onLoad ?? 0, 1);
		return { from: 0, to: end * 1.015 };
	}, [report.summary.duration, report.summary.onLoad]);
	const domain = range ?? fullDomain;

	const findingsByRequest = useMemo(() => {
		const map = new Map<number, Finding[]>();
		for (const finding of report.findings) {
			for (const id of finding.requestIds) {
				const list = map.get(id);
				if (list) list.push(finding);
				else map.set(id, [finding]);
			}
		}
		return map;
	}, [report.findings]);

	const findingsByEndpoint = useMemo(() => {
		const map = new Map<string, Finding[]>();
		for (const finding of report.findings) {
			const keys = new Set(finding.endpoint ? [finding.endpoint] : finding.requestIds.map((id) => report.requests[id]?.endpoint ?? ""));
			for (const key of keys) {
				if (!key) continue;
				const list = map.get(key);
				if (list) list.push(finding);
				else map.set(key, [finding]);
			}
		}
		return map;
	}, [report.findings, report.requests]);

	const select = useCallback((id: number | null) => setSelectedId(id), []);

	const setActiveFinding = useCallback((id: string | null) => {
		setActiveFindingId(id);
		if (id === null) setIsolate(false);
	}, []);

	const getDetail = useCallback(
		(id: number) => {
			let promise = detailCache.current.get(id);
			if (!promise) {
				promise = analyzer.detail(id);
				promise.catch(() => detailCache.current.delete(id));
				detailCache.current.set(id, promise);
			}
			return promise;
		},
		[analyzer],
	);

	const openCompare = useCallback((a: number | null = null, b: number | null = null) => setCompare({ a, b }), []);

	const context = useMemo<WorkspaceContextValue>(
		() => ({
			report,
			analyzer,
			requests: report.requests,
			fullDomain,
			domain,
			setRange,
			selectedId,
			select,
			activeFinding,
			setActiveFinding,
			highlighted,
			isolate,
			setIsolate,
			findingsByRequest,
			findingsByEndpoint,
			openCompare,
			getDetail,
		}),
		[report, analyzer, fullDomain, domain, selectedId, select, activeFinding, setActiveFinding, highlighted, isolate, findingsByRequest, findingsByEndpoint, openCompare, getDetail],
	);

	const dialogsOpen = exportOpen || settingsOpen || helpOpen || compare !== null;

	// Keyboard shortcuts. Lists handle their own arrow keys.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (dialogsOpen || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
			const findings = report.findings;
			const index = findings.findIndex((f) => f.id === activeFindingId);
			switch (event.key) {
				case "/":
					event.preventDefault();
					setPane("requests");
					searchRef.current?.focus();
					return;
				case "]":
				case "[": {
					if (!findings.length) return;
					event.preventDefault();
					const step = event.key === "]" ? 1 : -1;
					const next = index === -1 ? (step === 1 ? 0 : findings.length - 1) : (index + step + findings.length) % findings.length;
					setActiveFinding(findings[next]!.id);
					return;
				}
				case "1":
					setView("waterfall");
					setPane("requests");
					return;
				case "2":
					setView("endpoints");
					setPane("requests");
					return;
				case "i":
					if (activeFindingId) setIsolate((value) => !value);
					return;
				case "c":
					openCompare(selectedId, null);
					return;
				case "e":
					setExportOpen(true);
					return;
				case "t":
					setSettingsOpen(true);
					return;
				case "?":
					setHelpOpen(true);
					return;
				case "Escape":
					if (selectedId !== null) setSelectedId(null);
					else if (activeFindingId) setActiveFinding(null);
					else if (range) setRange(null);
					return;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [dialogsOpen, report.findings, activeFindingId, selectedId, range, openCompare, setActiveFinding]);

	return (
		<WorkspaceContext.Provider value={context}>
			<div className={`flex min-h-dvh flex-col bg-paper transition-[filter] lg:h-dvh lg:overflow-hidden ${dragging ? "brightness-90" : ""}`}>
				<TopBar
					onHome={analyzer.reset}
					onOpenFile={onOpenFile}
					onExport={() => setExportOpen(true)}
					onSettings={() => setSettingsOpen(true)}
					onCompare={() => openCompare(selectedId, null)}
					onHelp={() => setHelpOpen(true)}
				/>
				<ReportHead />
				<Exposure />

				{/* Small screens: switch between the findings and the requests. */}
				<div className="surface-paper sticky top-0 z-30 flex border-b border-(--rule) bg-paper lg:hidden" role="tablist" aria-label="Panels">
					{(["findings", "requests"] as const).map((id) => (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={pane === id}
							onClick={() => setPane(id)}
							className={`label relative flex-1 px-4 py-3 ${pane === id ? "text-(--fg)" : "text-(--muted)"}`}
						>
							{id === "findings" ? `Findings ${report.findings.length}` : `Requests ${report.requests.length}`}
							<span aria-hidden className={`absolute inset-x-0 -bottom-px h-px bg-signal transition-transform ${pane === id ? "scale-x-100" : "scale-x-0"}`} />
						</button>
					))}
				</div>

				<div className="relative flex h-[calc(100dvh-2.75rem)] min-h-0 lg:h-auto lg:flex-1">
					<FindingsRail
						open={railOpen}
						onToggle={() => setRailOpen((value) => !value)}
						onSettings={() => setSettingsOpen(true)}
						className={pane === "findings" ? "flex" : "hidden lg:flex"}
					/>
					<main className={`min-w-0 flex-1 flex-col ${pane === "requests" ? "flex" : "hidden lg:flex"}`} aria-label="Requests">
						<Toolbar view={view} onView={setView} query={query} onQuery={setQuery} types={types} onTypes={setTypes} searchRef={searchRef} />
						{view === "waterfall" ? <Waterfall query={query} types={types} /> : <EndpointsTable query={query} types={types} />}
					</main>
					{selectedId !== null ? <Inspector key={selectedId} id={selectedId} /> : null}
				</div>
			</div>

			<p className="sr-only" role="status" aria-live="polite">
				{`Report ready for ${report.meta.fileName}: ${report.summary.requests} requests, ${report.findings.length} findings.`}
			</p>
			<DiffView state={compare} onChange={setCompare} onClose={() => setCompare(null)} />
			<ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
			<SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
			<ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
		</WorkspaceContext.Provider>
	);
}
