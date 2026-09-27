"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Close } from "./icons";

interface DialogProps {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	label?: ReactNode;
	children: ReactNode;
	className?: string;
	/** "sheet" fills the viewport; "panel" is a centred card. */
	variant?: "panel" | "sheet";
	actions?: ReactNode;
}

/** A native <dialog>: focus trap, Escape and inert background come from the browser. */
export function Dialog({ open, onClose, title, label, children, className = "", variant = "panel", actions }: DialogProps) {
	const ref = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	}, [open]);

	const size =
		variant === "sheet"
			? "m-0 h-dvh w-screen sm:m-auto sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:rounded-[4px]"
			: "m-auto w-[min(640px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-[4px]";

	return (
		<dialog
			ref={ref}
			onClose={onClose}
			onClick={(event) => {
				if (event.target === ref.current) onClose();
			}}
			className={`surface-paper bg-paper p-0 text-ink shadow-[0_40px_120px_-40px_rgb(17_18_20/0.7)] open:flex open:flex-col ${size} ${className}`}
		>
			<header className="surface-ink flex shrink-0 items-center justify-between gap-4 bg-ink px-4 py-3 sm:px-5">
				<div className="flex min-w-0 items-baseline gap-3">
					{label ? <span className="label shrink-0 text-(--muted)">{label}</span> : null}
					<h2 className="truncate text-[0.9375rem] font-medium">{title}</h2>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{actions}
					<button
						type="button"
						onClick={onClose}
						className="grid size-8 place-items-center rounded-full text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--fg)"
						aria-label="Close"
					>
						<Close />
					</button>
				</div>
			</header>
			<div className="scroll-thin min-h-0 flex-1 overflow-auto">{open ? children : null}</div>
		</dialog>
	);
}
