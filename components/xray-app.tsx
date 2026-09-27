"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Landing } from "./landing/landing";
import { useAnalyzer } from "./use-analyzer";
import { Workspace } from "./workspace/workspace";

export function XrayApp() {
	const analyzer = useAnalyzer();
	const { state, report, load, loadSample } = analyzer;
	const [dragging, setDragging] = useState(false);
	const pickerRef = useRef<HTMLInputElement>(null);
	const autoSample = useRef(false);

	const onFile = useCallback((file: File) => void load(file, file.name), [load]);

	// ?sample opens the demo directly: a bookmarkable link for the portfolio.
	useEffect(() => {
		if (autoSample.current) return;
		autoSample.current = true;
		if (new URLSearchParams(window.location.search).has("sample")) void loadSample();
	}, [loadSample]);

	// Drop a file anywhere on the page, and ⌘O / Ctrl+O to open one.
	useEffect(() => {
		let depth = 0;
		const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
		const onEnter = (event: DragEvent) => {
			if (!hasFiles(event)) return;
			depth++;
			setDragging(true);
		};
		const onLeave = (event: DragEvent) => {
			if (!hasFiles(event)) return;
			depth = Math.max(0, depth - 1);
			if (depth === 0) setDragging(false);
		};
		const onOver = (event: DragEvent) => {
			if (hasFiles(event)) event.preventDefault();
		};
		const onDrop = (event: DragEvent) => {
			if (!hasFiles(event)) return;
			event.preventDefault();
			depth = 0;
			setDragging(false);
			const file = event.dataTransfer?.files[0];
			if (file) onFile(file);
		};
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
				event.preventDefault();
				pickerRef.current?.click();
			}
		};
		window.addEventListener("dragenter", onEnter);
		window.addEventListener("dragleave", onLeave);
		window.addEventListener("dragover", onOver);
		window.addEventListener("drop", onDrop);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("dragenter", onEnter);
			window.removeEventListener("dragleave", onLeave);
			window.removeEventListener("dragover", onOver);
			window.removeEventListener("drop", onDrop);
			window.removeEventListener("keydown", onKey);
		};
	}, [onFile]);

	const openPicker = useCallback(() => pickerRef.current?.click(), []);
	const showWorkspace = report !== null && state.status === "ready";

	return (
		<>
			{showWorkspace ? (
				<Workspace key={report.meta.fileName + report.meta.fileSize + report.requests.length} analyzer={analyzer} report={report} onOpenFile={openPicker} dragging={dragging} />
			) : (
				<Landing state={state} dragging={dragging} onFile={onFile} onSample={() => void loadSample()} onDragChange={setDragging} />
			)}
			<input
				ref={pickerRef}
				type="file"
				accept=".har,.json,application/json"
				className="sr-only"
				tabIndex={-1}
				aria-hidden
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) onFile(file);
					event.target.value = "";
				}}
			/>
		</>
	);
}
