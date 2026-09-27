"use client";

import type { ReactNode } from "react";
import { formatBytes } from "@/lib/format";
import { Compare, Download, Keyboard, Mark, Sliders, Upload } from "../ui/icons";
import { useWorkspace } from "./context";

function BarButton({ onClick, children, label, shortcut, primary = false }: { onClick: () => void; children: ReactNode; label: string; shortcut?: string; primary?: boolean }) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={shortcut ? `${label} (${shortcut})` : label}
			className={`label inline-flex h-8 items-center gap-2 rounded-full px-3 transition-colors ${
				primary ? "bg-paper text-ink hover:bg-signal" : "text-(--muted) hover:bg-(--hover) hover:text-(--fg)"
			}`}
		>
			{children}
			<span className="hidden md:inline">{label}</span>
		</button>
	);
}

interface TopBarProps {
	onHome: () => void;
	onOpenFile: () => void;
	onExport: () => void;
	onSettings: () => void;
	onCompare: () => void;
	onHelp: () => void;
}

export function TopBar({ onHome, onOpenFile, onExport, onSettings, onCompare, onHelp }: TopBarProps) {
	const { report } = useWorkspace();
	const { meta } = report;
	return (
		<header className="surface-ink flex h-12 shrink-0 items-center justify-between gap-3 border-b border-(--rule) bg-ink px-3 sm:px-4">
			<div className="flex min-w-0 items-center gap-3">
				<button type="button" onClick={onHome} className="flex shrink-0 items-center gap-2.5" title="Close this file and go back to the start">
					<Mark className="size-6" />
					<span className="hidden text-[0.875rem] font-semibold tracking-tight sm:inline">Request X-ray</span>
				</button>
				<span aria-hidden className="hidden h-4 w-px bg-(--rule-strong) sm:block" />
				<div className="flex min-w-0 items-baseline gap-2.5">
					<span className="truncate font-mono text-[0.8125rem]" title={meta.fileName}>
						{meta.fileName}
					</span>
					<span className="label hidden shrink-0 text-(--muted) md:inline">
						{formatBytes(meta.fileSize)}
						{meta.creator ? ` · ${meta.creator}` : ""}
					</span>
				</div>
			</div>
			<nav className="flex shrink-0 items-center gap-0.5" aria-label="Report actions">
				<BarButton onClick={onCompare} label="Compare" shortcut="C">
					<Compare />
				</BarButton>
				<BarButton onClick={onSettings} label="Thresholds" shortcut="T">
					<Sliders />
				</BarButton>
				<BarButton onClick={onHelp} label="Keys" shortcut="?">
					<Keyboard />
				</BarButton>
				<BarButton onClick={onOpenFile} label="Open" shortcut="⌘O">
					<Upload />
				</BarButton>
				<span aria-hidden className="mx-1.5 h-4 w-px bg-(--rule-strong)" />
				<BarButton onClick={onExport} label="Export" shortcut="E" primary>
					<Download />
				</BarButton>
			</nav>
		</header>
	);
}
