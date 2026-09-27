import { impressionOf } from "../analysis/impression";
import { RULE_INFO } from "../analysis/rule-info";
import { formatBytes, formatCount, formatMs, formatTick, timeTicks, truncateMiddle } from "../format";
import type { Entry } from "../har/entries";
import type { Report } from "../model";
import { COLORS, SEVERITY_META, TYPE_META } from "../palette";
import { Redactor } from "../redact/redact";
import { TOOL, type ReportExportOptions } from "./json-report";

const MAX_WATERFALL_ROWS = 600;
const MAX_REQUESTS_PER_FINDING = 25;

function esc(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const CSS = `
:root{--paper:${COLORS.paper};--paper-2:${COLORS.paper2};--ink:${COLORS.ink};--signal:${COLORS.signal};--signal-deep:${COLORS.signalDeep};--mute:${COLORS.mute};--rule:rgb(17 18 20/.14);--rule-strong:rgb(17 18 20/.32);
--sans:"Bricolage Grotesque",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Instrument Serif",ui-serif,Georgia,serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
main{max-width:1180px;margin:0 auto;padding:48px 24px 80px}
.label{font:500 11px/1.4 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}
.mono{font-family:var(--mono)}
h1{font-weight:650;letter-spacing:-.035em;line-height:.95;font-size:clamp(40px,7vw,76px);margin:14px 0 0}
h2{font:500 11px/1.4 var(--mono);letter-spacing:.12em;text-transform:uppercase;margin:0;padding:14px 0;border-bottom:1px solid var(--rule-strong);display:flex;justify-content:space-between}
section{margin-top:56px}
.impression{font-family:var(--serif);font-size:clamp(22px,3vw,32px);line-height:1.2;margin:24px 0 0;max-width:900px}
.impression em{color:var(--signal-deep)}
.meta{display:flex;flex-wrap:wrap;gap:6px 24px;margin-top:18px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));border-top:1px solid var(--rule);margin-top:36px}
.stat{padding:14px 16px 14px 0;border-bottom:1px solid var(--rule)}
.stat b{display:block;font:500 26px/1.1 var(--mono);letter-spacing:-.02em;margin-top:6px}
.finding{display:grid;grid-template-columns:120px 1fr;gap:8px 24px;padding:22px 0;border-bottom:1px solid var(--rule)}
.sev{display:inline-flex;align-items:center;gap:8px;font:500 11px/1 var(--mono);letter-spacing:.12em}
.sev i{width:9px;height:9px;display:inline-block;border:1.5px solid var(--ink)}
.sev.high i{background:var(--signal);border-color:var(--signal-deep)}.sev.medium i{background:linear-gradient(90deg,var(--ink) 50%,transparent 50%)}
.subject{font:500 13.5px/1.4 var(--mono);word-break:break-all}
.title{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:2px 0 8px}
.why{margin:0 0 6px;max-width:760px}.fix{margin:0;max-width:760px;color:var(--mute)}.fix b{color:var(--ink);font-weight:600}
.impact{font:500 12px/1.4 var(--mono);color:var(--signal-deep);margin-top:8px}
table{width:100%;border-collapse:collapse;font:12px/1.45 var(--mono)}
th{font-weight:500;text-align:left;color:var(--mute);letter-spacing:.08em;text-transform:uppercase;font-size:10.5px;padding:8px 10px 8px 0;border-bottom:1px solid var(--rule-strong)}
td{padding:6px 10px 6px 0;border-bottom:1px solid var(--rule);vertical-align:top}
td.num,th.num{text-align:right;white-space:nowrap}
td.url{word-break:break-all}
.reqs{margin-top:12px}
.waterfall{overflow-x:auto;border-top:1px solid var(--rule)}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin:14px 0}
.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{width:14px;height:6px;display:inline-block}
footer{margin-top:72px;padding-top:18px;border-top:1px solid var(--rule-strong);display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between}
a{color:inherit}
@media print{main{padding:0}section{break-inside:avoid-page}}
`;

function waterfallSvg(entries: readonly Entry[], report: Report, redactor: Redactor): string {
	const rows = entries.slice(0, MAX_WATERFALL_ROWS);
	const labelWidth = 300;
	const chartWidth = 820;
	const rowHeight = 14;
	const top = 22;
	const end = Math.max(1, ...rows.map((e) => e.end), report.summary.onLoad ?? 0);
	const x = (ms: number) => labelWidth + (ms / end) * chartWidth;
	const height = top + rows.length * rowHeight + 8;

	const ticks = timeTicks(0, end, 8)
		.map(
			(t) =>
				`<line x1="${x(t)}" x2="${x(t)}" y1="${top - 4}" y2="${height}" stroke="rgb(17 18 20/.08)"/><text x="${x(t) + 3}" y="${top - 8}" font-size="9" fill="${COLORS.mute}">${esc(formatTick(t))}</text>`,
		)
		.join("");

	const markers = report.pages
		.flatMap((page) => [
			page.onContentLoad !== null ? { at: page.onContentLoad, label: "DCL" } : null,
			page.onLoad !== null ? { at: page.onLoad, label: "Load" } : null,
		])
		.filter((m): m is { at: number; label: string } => m !== null)
		.map(
			(m) =>
				`<line x1="${x(m.at)}" x2="${x(m.at)}" y1="${top - 4}" y2="${height}" stroke="${COLORS.signalDeep}" stroke-dasharray="3 3"/><text x="${x(m.at) - 3}" y="${height - 4}" font-size="9" text-anchor="end" fill="${COLORS.signalDeep}">${m.label}</text>`,
		)
		.join("");

	const bars = rows
		.map((e, i) => {
			const y = top + i * rowHeight;
			const color = TYPE_META[e.type].color;
			const w = Math.max(1.5, x(e.end) - x(e.start));
			const failed = e.failed || e.status >= 400;
			const name = truncateMiddle(`${e.method} ${redactor.text(e.path)}`, 48);
			return `<text x="0" y="${y + 10}" font-size="10" fill="${failed ? COLORS.signalDeep : COLORS.ink}">${esc(name)}</text><rect x="${x(e.start)}" y="${y + 3}" width="${w}" height="8" fill="${color}"${failed ? ` stroke="${COLORS.signalDeep}"` : ""}/>`;
		})
		.join("");

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${labelWidth + chartWidth + 10} ${height}" width="${labelWidth + chartWidth + 10}" height="${height}" font-family="JetBrains Mono, ui-monospace, monospace" role="img" aria-label="Waterfall of ${rows.length} requests">${ticks}${markers}${bars}</svg>`;
}

/** A self-contained HTML report: no scripts, no external requests, secrets removed. */
export function buildHtmlReport(
	report: Report,
	entries: readonly Entry[],
	options: ReportExportOptions,
	redactor = new Redactor({ emails: options.emails }),
): string {
	const { summary, findings, meta } = report;
	const impression = impressionOf(report);
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const generated = new Date();

	const stats = [
		["Requests", formatCount(summary.requests)],
		["Transferred", formatBytes(summary.transferred)],
		["Resources", formatBytes(summary.contentSize)],
		["Finished", formatMs(summary.duration)],
		["On load", summary.onLoad !== null ? formatMs(summary.onLoad) : "n/a"],
		["Endpoints", formatCount(summary.endpoints)],
		["Hosts", formatCount(summary.hosts)],
		["Findings", `${summary.bySeverity.high}/${summary.bySeverity.medium}/${summary.bySeverity.low}`],
	]
		.map(([label, value]) => `<div class="stat"><span class="label">${esc(label)}</span><b>${esc(value)}</b></div>`)
		.join("");

	const findingsHtml = findings.length
		? findings
				.map((finding, index) => {
					const involved = finding.requestIds.slice(0, MAX_REQUESTS_PER_FINDING).map((id) => byId.get(id)).filter((e): e is Entry => !!e);
					const more = finding.requestIds.length - involved.length;
					const impact = [finding.impact.ms ? `${formatMs(finding.impact.ms)}` : "", finding.impact.bytes ? formatBytes(finding.impact.bytes) : ""]
						.filter(Boolean)
						.join(" · ");
					const rows = involved
						.map(
							(e) =>
								`<tr><td>${e.id + 1}</td><td>${esc(e.method)}</td><td class="url">${esc(truncateMiddle(redactor.url(e.url), 140))}</td><td class="num">${e.status || "failed"}</td><td class="num">${formatMs(e.duration)}</td><td class="num">${e.transferSize >= 0 ? formatBytes(e.transferSize) : "n/a"}</td></tr>`,
						)
						.join("");
					return `<article class="finding">
<div><div class="label">F${String(index + 1).padStart(2, "0")} · ${esc(RULE_INFO[finding.rule].label)}</div><div class="sev ${finding.severity}" style="margin-top:10px"><i></i>${SEVERITY_META[finding.severity].short}</div></div>
<div><div class="subject">${esc(redactor.text(finding.subject))}</div><div class="title">${esc(redactor.text(finding.title))}</div>
<p class="why">${esc(finding.why)}</p><p class="fix"><b>Fix.</b> ${esc(finding.fix)}</p>${impact ? `<div class="impact">Impact ${esc(impact)}</div>` : ""}
<table class="reqs"><thead><tr><th>#</th><th>Method</th><th>URL</th><th class="num">Status</th><th class="num">Time</th><th class="num">Size</th></tr></thead><tbody>${rows}</tbody></table>${more > 0 ? `<p class="label">and ${more} more</p>` : ""}</div></article>`;
				})
				.join("")
		: `<p class="impression" style="font-size:22px">No findings at the current thresholds.</p>`;

	const endpointRows = report.endpoints
		.slice(0, 60)
		.map(
			(ep) =>
				`<tr><td>${esc(ep.method)}</td><td class="url">${esc(ep.host)}<b style="font-weight:500">${esc(redactor.text(ep.pattern))}</b></td><td class="num">${ep.calls}</td><td class="num">${formatMs(ep.totalTime)}</td><td class="num">${formatMs(ep.avgTime)}</td><td class="num">${formatBytes(ep.totalTransfer)}</td></tr>`,
		)
		.join("");

	const legend = Object.values(TYPE_META)
		.map((t) => `<span class="label"><i style="background:${t.color}"></i>${esc(t.short)}</span>`)
		.join("");

	const waterfall = waterfallSvg(entries, report, redactor);
	const truncatedNote = entries.length > MAX_WATERFALL_ROWS ? `<p class="label">Showing the first ${MAX_WATERFALL_ROWS} of ${formatCount(entries.length)} requests.</p>` : "";
	const s = redactor.stats;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>Request X-ray · ${esc(redactor.text(meta.fileName))}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<div class="label"><span style="color:var(--signal-deep)">●</span> Request X-ray report</div>
<h1>${esc(summary.primaryHost || redactor.text(meta.fileName))}</h1>
<p class="impression">${esc(impression.lead)}${impression.highlight ? ` <em>${esc(redactor.text(impression.highlight))}</em>` : ""}${impression.tail ? ` ${esc(impression.tail)}` : ""}</p>
<div class="meta label"><span>File ${esc(redactor.text(meta.fileName))}</span>${meta.creator ? `<span>Captured with ${esc(meta.creator)}</span>` : ""}<span>Generated ${esc(generated.toISOString().slice(0, 16).replace("T", " "))} UTC</span></div>
<div class="stats">${stats}</div>
</header>
<section><h2><span>Findings</span><span>${findings.length}</span></h2>${findingsHtml}</section>
<section><h2><span>Waterfall</span><span>${formatCount(entries.length)} requests</span></h2><div class="legend">${legend}</div><div class="waterfall">${waterfall}</div>${truncatedNote}</section>
<section><h2><span>Endpoints</span><span>${formatCount(report.endpoints.length)}</span></h2><table><thead><tr><th>Method</th><th>Endpoint</th><th class="num">Calls</th><th class="num">Total</th><th class="num">Avg</th><th class="num">Size</th></tr></thead><tbody>${endpointRows}</tbody></table></section>
<footer class="label"><span>Redacted: ${s.headers} auth headers, ${s.cookies} cookies, ${s.params} URL parameters, ${s.tokens} tokens${options.emails ? `, ${s.emails} emails` : ""}. Response bodies are not included.</span><span>${esc(TOOL.name)} ${esc(TOOL.version)} · <a href="${TOOL.url}">sujanrokad.com</a></span></footer>
</main>
</body>
</html>
`;
}
