"use client";

import { useState } from "react";
import type { RedactionStats } from "@/lib/redact/redact";
import { DEFAULT_EXPORT_OPTIONS, type ExportFormat, type ExportOptions } from "@/lib/worker/protocol";
import { Dialog } from "../ui/dialog";
import { Check, Download, Lock } from "../ui/icons";
import { useWorkspace } from "./context";

const FORMATS: Array<{ id: ExportFormat; title: string; ext: string; body: string }> = [
	{ id: "html", title: "HTML report", ext: ".html", body: "One file anyone can open: impression, findings, waterfall and endpoints. No scripts, no external requests." },
	{ id: "json", title: "JSON report", ext: ".json", body: "The same report as structured data, for scripts, tickets or a before-and-after comparison." },
	{ id: "har", title: "Sanitized HAR", ext: ".har", body: "A cleaned copy of the capture that DevTools and other tools can open. Safe to attach to a ticket." },
];

const ALWAYS = [
	"Authorization, cookies and Set-Cookie",
	"API keys, session and CSRF headers",
	"Tokens and secrets in URLs and JSON bodies",
	"JWTs and bearer tokens anywhere",
	"Card numbers (Luhn-checked)",
];

function statsLine(stats: RedactionStats, emails: boolean): string {
	const parts = [
		[stats.headers, "auth header"],
		[stats.cookies, "cookie"],
		[stats.params, "URL parameter"],
		[stats.tokens, "token"],
		[stats.fields, "secret field"],
		[stats.cards, "card number"],
		...(emails ? [[stats.emails, "email"] as const] : []),
	] as const;
	const text = parts
		.filter(([count]) => count > 0)
		.map(([count, noun]) => `${count} ${noun}${count === 1 ? "" : "s"}`)
		.join(", ");
	return text ? `Removed ${text}.` : "Nothing sensitive was found to remove.";
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { analyzer } = useWorkspace();
	const [format, setFormat] = useState<ExportFormat>("html");
	const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{ format: ExportFormat; stats: RedactionStats } | null>(null);
	const [error, setError] = useState<string | null>(null);

	const run = async () => {
		setBusy(true);
		setError(null);
		try {
			const stats = await analyzer.exportFile(format, options);
			setResult({ format, stats });
		} catch (reason) {
			setError((reason as { message?: string })?.message ?? "Export failed.");
		} finally {
			setBusy(false);
		}
	};

	const option = (key: keyof ExportOptions, label: string, hint: string, show: boolean) =>
		show ? (
			<label className="flex cursor-pointer items-start gap-3 py-2">
				<input
					type="checkbox"
					checked={options[key]}
					onChange={(event) => {
						setOptions({ ...options, [key]: event.target.checked });
						setResult(null);
					}}
					className="mt-1 size-4 accent-ink"
				/>
				<span>
					<span className="block text-[0.9375rem] font-medium">{label}</span>
					<span className="block text-[0.8125rem] text-(--muted)">{hint}</span>
				</span>
			</label>
		) : null;

	return (
		<Dialog open={open} onClose={onClose} label="Export" title="Redact and export">
			<div className="grid gap-6 p-5 sm:p-6">
				<fieldset>
					<legend className="label mb-3 text-(--muted)">Format</legend>
					<div className="grid gap-2">
						{FORMATS.map((item) => (
							<label
								key={item.id}
								className={`flex cursor-pointer items-start gap-3 rounded-[3px] border px-4 py-3 transition-colors ${format === item.id ? "border-ink bg-paper-2/70" : "border-(--rule) hover:border-(--rule-strong)"}`}
							>
								<input
									type="radio"
									name="format"
									value={item.id}
									checked={format === item.id}
									onChange={() => {
										setFormat(item.id);
										setResult(null);
									}}
									className="mt-1 accent-signal"
								/>
								<span className="min-w-0">
									<span className="flex items-baseline gap-2">
										<span className="font-medium">{item.title}</span>
										<span className="font-mono text-[0.6875rem] text-(--muted)">{item.ext}</span>
									</span>
									<span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-(--muted)">{item.body}</span>
								</span>
							</label>
						))}
					</div>
				</fieldset>

				<div className="grid gap-5 sm:grid-cols-2">
					<div>
						<p className="label mb-2 flex items-center gap-2 text-(--muted)">
							<Lock /> Always removed
						</p>
						<ul className="grid gap-1 text-[0.8125rem]">
							{ALWAYS.map((item) => (
								<li key={item} className="flex items-start gap-2">
									<Check className="mt-0.5 shrink-0 text-(--accent)" />
									{item}
								</li>
							))}
						</ul>
					</div>
					<div>
						<p className="label mb-1 text-(--muted)">Options</p>
						{option("emails", "Remove email addresses", "In URLs, headers and bodies.", true)}
						{option("headers", "Include headers", "Adds redacted request and response headers to each request.", format === "json")}
						{option("responseBodies", "Keep response bodies", "Redacted, but bodies can still hold names, addresses or orders. Off by default.", format === "har")}
						{format === "html" ? <p className="py-2 text-[0.8125rem] text-(--muted)">Response bodies are never included in reports.</p> : null}
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-4 border-t border-(--rule) pt-5">
					<p className="min-w-0 flex-1 text-[0.8125rem] text-(--muted)" aria-live="polite">
						{error ? <span className="text-signal-deep">{error}</span> : result ? <span className="text-(--fg)">Saved. {statsLine(result.stats, options.emails)}</span> : "The file is built on this device and saved straight to your downloads."}
					</p>
					<button
						type="button"
						onClick={run}
						disabled={busy}
						className="inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-signal hover:text-ink disabled:opacity-60"
					>
						<Download />
						{busy ? "Preparing…" : `Download ${FORMATS.find((f) => f.id === format)!.title}`}
					</button>
				</div>
			</div>
		</Dialog>
	);
}
