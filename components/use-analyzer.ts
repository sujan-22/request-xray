"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type Report, type Settings } from "@/lib/model";
import type { RequestDetail } from "@/lib/worker/detail";
import type { ExportFormat, ExportOptions, Stage, WorkerError, WorkerRequest, WorkerResponse } from "@/lib/worker/protocol";
import type { RequestDiff } from "@/lib/worker/request-diff";
import type { RedactionStats } from "@/lib/redact/redact";

export const SAMPLE = { url: "/samples/fernwood-storefront.har", name: "fernwood-storefront.har" };
const SETTINGS_KEY = "request-xray:settings";

export type LoadState =
	| { status: "idle" }
	| { status: "loading"; name: string; stage: Stage | "fetching"; loaded: number; total: number }
	| { status: "ready" }
	| { status: "error"; name: string; error: WorkerError };

type Pending = {
	resolve: (message: WorkerResponse) => void;
	reject: (error: WorkerError) => void;
	onProgress?: (message: Extract<WorkerResponse, { type: "progress" }>) => void;
};

type RequestBody = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

function readSettings(): Settings {
	try {
		const raw = window.localStorage.getItem(SETTINGS_KEY);
		if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
	} catch {
		// storage unavailable: use defaults
	}
	return DEFAULT_SETTINGS;
}

function writeSettings(settings: Settings) {
	try {
		window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// storage unavailable: settings last for this session only
	}
}

export function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useAnalyzer() {
	const workerRef = useRef<Worker | null>(null);
	const pending = useRef(new Map<number, Pending>());
	const nextId = useRef(1);
	const [state, setState] = useState<LoadState>({ status: "idle" });
	const [report, setReport] = useState<Report | null>(null);
	const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);

	useEffect(() => {
		// Read persisted thresholds after hydration so server and client render the same markup.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setSettingsState(readSettings());
		return () => workerRef.current?.terminate();
	}, []);

	const spawn = useCallback(() => {
		const worker = new Worker(new URL("../workers/analyzer.worker.ts", import.meta.url), { type: "module" });
		worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			const entry = pending.current.get(message.id);
			if (!entry) return;
			if (message.type === "progress") {
				entry.onProgress?.(message);
				return;
			}
			pending.current.delete(message.id);
			if (message.type === "error") entry.reject(message.error);
			else entry.resolve(message);
		});
		worker.addEventListener("error", (event) => {
			for (const [, entry] of pending.current) entry.reject({ code: "internal", message: "The analysis worker crashed.", detail: event.message });
			pending.current.clear();
		});
		workerRef.current = worker;
		return worker;
	}, []);

	const send = useCallback(
		<T extends WorkerResponse["type"]>(body: RequestBody, onProgress?: Pending["onProgress"]) =>
			new Promise<Extract<WorkerResponse, { type: T }>>((resolve, reject) => {
				const worker = workerRef.current ?? spawn();
				const id = nextId.current++;
				pending.current.set(id, { resolve: resolve as Pending["resolve"], reject, onProgress });
				worker.postMessage({ ...body, id } as WorkerRequest);
			}),
		[spawn],
	);

	const load = useCallback(
		async (file: Blob, name: string) => {
			// A new file cancels whatever the worker was doing.
			if (workerRef.current) {
				workerRef.current.terminate();
				workerRef.current = null;
				for (const [, entry] of pending.current) entry.reject({ code: "internal", message: "Cancelled" });
				pending.current.clear();
			}
			setState({ status: "loading", name, stage: "reading", loaded: 0, total: file.size });
			try {
				const result = await send<"report">({ type: "load", file, name, settings: readSettings() }, (p) =>
					setState({ status: "loading", name, stage: p.stage, loaded: p.loaded, total: p.total }),
				);
				setReport(result.report);
				setState({ status: "ready" });
			} catch (error) {
				const workerError = error as WorkerError;
				if (workerError.message === "Cancelled") return;
				setState({ status: "error", name, error: workerError });
			}
		},
		[send],
	);

	const loadSample = useCallback(async () => {
		setState({ status: "loading", name: SAMPLE.name, stage: "fetching", loaded: 0, total: 0 });
		try {
			const response = await fetch(SAMPLE.url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const blob = await response.blob();
			await load(blob, SAMPLE.name);
		} catch (error) {
			setState({
				status: "error",
				name: SAMPLE.name,
				error: { code: "read-failed", message: "Couldn't load the sample file.", detail: error instanceof Error ? error.message : String(error) },
			});
		}
	}, [load]);

	const updateSettings = useCallback(
		async (next: Settings) => {
			setSettingsState(next);
			writeSettings(next);
			if (!report) return;
			try {
				const result = await send<"report">({ type: "settings", settings: next });
				setReport(result.report);
			} catch {
				// keep the previous report
			}
		},
		[report, send],
	);

	const detail = useCallback(async (requestId: number): Promise<RequestDetail> => (await send<"detail">({ type: "detail", requestId })).detail, [send]);

	const diff = useCallback(async (a: number, b: number): Promise<RequestDiff> => (await send<"diff">({ type: "diff", a, b })).diff, [send]);

	const exportFile = useCallback(
		async (format: ExportFormat, options: ExportOptions): Promise<RedactionStats> => {
			const result = await send<"export">({ type: "export", format, options });
			downloadBlob(result.blob, result.fileName);
			return result.stats;
		},
		[send],
	);

	const reset = useCallback(() => {
		setState({ status: "idle" });
		setReport(null);
	}, []);

	return { state, report, settings, load, loadSample, updateSettings, detail, diff, exportFile, reset };
}

export type Analyzer = ReturnType<typeof useAnalyzer>;
