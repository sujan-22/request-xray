"use client";

import { useState } from "react";
import { Redactor } from "@/lib/redact/redact";
import { Eye, EyeOff } from "../ui/icons";

const redactor = new Redactor();

interface HeadersTableProps {
	title: string;
	rows: Array<{ name: string; value: string }>;
	empty?: string;
	/** Mask auth headers and cookies until asked, so a screen share doesn't leak them. */
	maskSecrets?: boolean;
}

export function HeadersTable({ title, rows, empty = "None", maskSecrets = true }: HeadersTableProps) {
	const [reveal, setReveal] = useState(false);
	const sensitive = maskSecrets ? rows.filter((row) => redactor.isSensitiveHeader(row.name)).length : 0;

	return (
		<section>
			<div className="flex items-center justify-between gap-3 border-b border-(--rule-strong) pb-1.5">
				<h3 className="label text-(--fg)">
					{title} <span className="text-(--muted)">{rows.length}</span>
				</h3>
				{sensitive ? (
					<button type="button" onClick={() => setReveal(!reveal)} aria-pressed={reveal} className="label-sm inline-flex items-center gap-1 text-(--muted) hover:text-(--fg)">
						{reveal ? <EyeOff /> : <Eye />}
						{reveal ? "Hide" : "Show"} {sensitive} secret{sensitive === 1 ? "" : "s"}
					</button>
				) : null}
			</div>
			{rows.length ? (
				<dl className="font-mono text-[0.71875rem] leading-relaxed">
					{rows.map((row, index) => {
						const masked = maskSecrets && !reveal && redactor.isSensitiveHeader(row.name);
						return (
							<div key={`${row.name}-${index}`} className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-3 border-b border-(--rule) py-1">
								<dt className="break-all text-(--muted)">{row.name}</dt>
								<dd className={`min-w-0 break-all ${masked ? "select-none text-(--muted)" : ""}`}>{masked ? "•••••••• hidden" : row.value || <span className="text-(--muted)">(empty)</span>}</dd>
							</div>
						);
					})}
				</dl>
			) : (
				<p className="py-2 text-[0.8125rem] text-(--muted)">{empty}</p>
			)}
		</section>
	);
}
