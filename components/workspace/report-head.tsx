"use client";

import { impressionOf } from "@/lib/analysis/impression";
import { formatBytes, formatCount, formatMs } from "@/lib/format";
import { SEVERITIES } from "@/lib/model";
import { SeverityMark } from "../ui/marks";
import { useWorkspace } from "./context";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
	return (
		<div className="min-w-0 py-1">
			<dt className="label-sm text-(--muted)">{label}</dt>
			<dd className="mt-1 font-mono text-[1.0625rem] leading-none tracking-tight tnum sm:text-[1.1875rem]" title={note}>
				{value}
			</dd>
		</div>
	);
}

export function ReportHead() {
	const { report, setActiveFinding } = useWorkspace();
	const { summary } = report;
	const impression = impressionOf(report);
	const page = report.pages[0];
	const top = report.findings[0];

	return (
		<section aria-label="Summary" className="surface-paper grain shrink-0 border-b border-(--rule) bg-paper">
			<div className="grid gap-x-8 gap-y-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:py-5">
				<div className="min-w-0">
					<p className="label flex min-w-0 items-center gap-2 text-(--muted)">
						<span className="text-(--accent)">●</span>
						<span className="shrink-0 text-(--fg)">Impression</span>
						<span className="truncate">
							· {summary.primaryHost}
							{page?.title && !page.title.includes(summary.primaryHost) ? ` · ${page.title}` : ""}
						</span>
					</p>
					<p className="serif mt-2 line-clamp-4 max-w-[62rem] text-[1.375rem] leading-[1.18] sm:text-[1.625rem] xl:text-[1.875rem]">
						{impression.lead}{" "}
						{impression.highlight && top ? (
							<button type="button" onClick={() => setActiveFinding(top.id)} className="text-left italic text-(--accent) underline decoration-(--rule-strong) decoration-1 underline-offset-[6px] transition-colors hover:decoration-current">
								{impression.highlight}
							</button>
						) : null}{" "}
						<span className="text-(--muted)">{impression.tail}</span>
					</p>
				</div>
				<dl className="grid grid-cols-3 gap-x-6 gap-y-3 border-(--rule) sm:grid-cols-[repeat(6,auto)] sm:justify-start lg:border-l lg:pl-8">
					<Stat label="Requests" value={formatCount(summary.requests)} />
					<Stat label="Transferred" value={formatBytes(summary.transferred)} note={`${formatBytes(summary.contentSize)} decoded`} />
					<Stat label="On load" value={summary.onLoad !== null ? formatMs(summary.onLoad) : "n/a"} />
					<Stat label="Finished" value={formatMs(summary.duration)} />
					<Stat label="Endpoints" value={formatCount(summary.endpoints)} />
					<div className="min-w-0 py-1">
						<dt className="label-sm text-(--muted)">Findings</dt>
						<dd className="mt-1 flex items-center gap-2.5 font-mono text-[1.0625rem] leading-none tnum sm:text-[1.1875rem]">
							{SEVERITIES.map((severity) => (
								<span key={severity} className="inline-flex items-center gap-1" title={`${summary.bySeverity[severity]} ${severity}`}>
									<SeverityMark severity={severity} />
									{summary.bySeverity[severity]}
									<span className="sr-only"> {severity}</span>
								</span>
							))}
						</dd>
					</div>
				</dl>
			</div>
		</section>
	);
}
