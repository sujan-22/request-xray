"use client";

import { useState } from "react";
import { Check, Copy } from "../ui/icons";

export function CopyButton({ value, label = "Copy", className = "" }: { value: string; label?: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(value);
					setCopied(true);
					setTimeout(() => setCopied(false), 1400);
				} catch {
					// clipboard unavailable
				}
			}}
			className={`label-sm inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-(--muted) transition-colors hover:text-(--fg) ${className}`}
			aria-label={copied ? "Copied" : label}
		>
			{copied ? <Check /> : <Copy />}
			<span aria-live="polite">{copied ? "Copied" : label}</span>
		</button>
	);
}
