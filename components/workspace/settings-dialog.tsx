"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/model";
import { Dialog } from "../ui/dialog";
import { Reset } from "../ui/icons";
import { useWorkspace } from "./context";

const FIELDS: Array<{ key: keyof Settings; label: string; unit: string; hint: string; min: number; max: number; step: number }> = [
	{ key: "slowMs", label: "Slow request", unit: "ms", hint: "Requests that take longer are flagged.", min: 50, max: 60_000, step: 50 },
	{ key: "largeApiKb", label: "Large API response", unit: "kB", hint: "Decoded size for fetch and XHR responses.", min: 1, max: 100_000, step: 10 },
	{ key: "largeAssetKb", label: "Large file", unit: "kB", hint: "Decoded size for scripts, images, documents and fonts.", min: 1, max: 100_000, step: 50 },
	{ key: "chattyMinCalls", label: "Chatty endpoint", unit: "calls", hint: "Calls to one endpoint with different ids before it's flagged.", min: 2, max: 500, step: 1 },
	{ key: "chainMinLength", label: "Sequential chain", unit: "calls", hint: "Minimum calls in a one-after-another chain.", min: 2, max: 50, step: 1 },
	{ key: "chainGapMs", label: "Chain gap", unit: "ms", hint: "Longest pause between one call ending and the next starting.", min: 0, max: 2000, step: 5 },
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { analyzer, report } = useWorkspace();
	const [draft, setDraft] = useState<Settings>(analyzer.settings);
	const timer = useRef<number | undefined>(undefined);
	const [lastOpen, setLastOpen] = useState(open);

	// Start from the saved settings each time the dialog opens.
	if (open !== lastOpen) {
		setLastOpen(open);
		if (open) setDraft(analyzer.settings);
	}

	useEffect(() => () => window.clearTimeout(timer.current), []);

	const apply = (next: Settings) => {
		setDraft(next);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => void analyzer.updateSettings(next), 250);
	};

	const isDefault = FIELDS.every((field) => draft[field.key] === DEFAULT_SETTINGS[field.key]);

	return (
		<Dialog open={open} onClose={onClose} label="Thresholds" title="Tune the findings">
			<div className="p-5 sm:p-6">
				<p className="mb-5 text-[0.9375rem] leading-relaxed text-(--muted)">
					Findings update as you type. Thresholds are saved in this browser and used for the next file too.
				</p>
				<div className="grid gap-x-6 sm:grid-cols-2">
					{FIELDS.map((field) => {
						const id = `setting-${field.key}`;
						const changed = draft[field.key] !== DEFAULT_SETTINGS[field.key];
						return (
							<div key={field.key} className="border-b border-(--rule) py-3">
								<div className="flex items-center justify-between gap-3">
									<label htmlFor={id} className="font-medium">
										{field.label}
									</label>
									<div className="flex items-center gap-1.5">
										<input
											id={id}
											type="number"
											inputMode="numeric"
											min={field.min}
											max={field.max}
											step={field.step}
											value={draft[field.key]}
											onChange={(event) => {
												const value = Number(event.target.value);
												if (!Number.isFinite(value)) return;
												apply({ ...draft, [field.key]: Math.min(field.max, Math.max(field.min, value)) });
											}}
											aria-describedby={`${id}-hint`}
											className={`h-8 w-24 rounded-[3px] border bg-paper px-2 text-right font-mono text-[0.8125rem] tnum focus:border-ink focus:outline-none ${changed ? "border-signal-deep" : "border-(--rule-strong)"}`}
										/>
										<span className="label-sm w-9 text-(--muted)">{field.unit}</span>
									</div>
								</div>
								<p id={`${id}-hint`} className="mt-1 text-[0.8125rem] text-(--muted)">
									{field.hint} <span className="font-mono text-[0.6875rem]">Default {DEFAULT_SETTINGS[field.key]}</span>
								</p>
							</div>
						);
					})}
				</div>
				<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
					<p className="label text-(--muted)" aria-live="polite">
						{report.findings.length} findings at these thresholds
					</p>
					<button
						type="button"
						onClick={() => apply(DEFAULT_SETTINGS)}
						disabled={isDefault}
						className="label inline-flex items-center gap-2 rounded-full border border-(--rule-strong) px-4 py-2 hover:border-ink disabled:opacity-40"
					>
						<Reset /> Reset to defaults
					</button>
				</div>
			</div>
		</Dialog>
	);
}
