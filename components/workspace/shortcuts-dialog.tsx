"use client";

import { Dialog } from "../ui/dialog";

const GROUPS: Array<{ title: string; keys: Array<[string[], string]> }> = [
	{
		title: "Findings",
		keys: [
			[["]"], "Next finding"],
			[["["], "Previous finding"],
			[["I"], "Isolate the finding's requests"],
			[["Esc"], "Close details, then clear the finding, then reset zoom"],
		],
	},
	{
		title: "Requests",
		keys: [
			[["J", "↓"], "Next request"],
			[["K", "↑"], "Previous request"],
			[["/"], "Filter requests"],
			[["1"], "Waterfall"],
			[["2"], "Endpoints"],
		],
	},
	{
		title: "Timeline",
		keys: [
			[["Drag"], "Zoom to a time window"],
			[["← →"], "Pan (overview focused)"],
			[["+ −"], "Zoom in and out"],
			[["0"], "Reset zoom"],
		],
	},
	{
		title: "Actions",
		keys: [
			[["C"], "Compare the selected request"],
			[["E"], "Export"],
			[["T"], "Thresholds"],
			[["⌘O"], "Open another file"],
			[["?"], "This list"],
		],
	},
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	return (
		<Dialog open={open} onClose={onClose} label="Keys" title="Keyboard shortcuts">
			<div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 sm:p-6">
				{GROUPS.map((group) => (
					<section key={group.title}>
						<h3 className="label mb-2 text-(--muted)">{group.title}</h3>
						<dl>
							{group.keys.map(([keys, description]) => (
								<div key={description} className="flex items-baseline justify-between gap-4 border-b border-(--rule) py-1.5">
									<dt className="text-[0.875rem]">{description}</dt>
									<dd className="flex shrink-0 gap-1">
										{keys.map((key) => (
											<kbd key={key} className="rounded-[3px] border border-(--rule-strong) bg-paper-2 px-1.5 py-0.5 font-mono text-[0.6875rem]">
												{key}
											</kbd>
										))}
									</dd>
								</div>
							))}
						</dl>
					</section>
				))}
			</div>
		</Dialog>
	);
}
