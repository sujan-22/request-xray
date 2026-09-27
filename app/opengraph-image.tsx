import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Request X-ray: count the calls, find the waste. A HAR analyzer that runs in your browser.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Spans for the film panel: [row, start %, width %, hot] */
const SPANS: Array<[number, number, number, boolean]> = [
	[0, 2, 30, false],
	[1, 30, 10, false],
	[2, 31, 22, false],
	[3, 31, 40, false],
	[4, 33, 14, false],
	[5, 44, 16, true],
	[6, 61, 18, true],
	[7, 80, 16, true],
	[8, 47, 9, false],
	[9, 49, 8, false],
	[10, 50, 11, false],
	[11, 52, 7, false],
	[12, 58, 36, false],
];

export default async function Image() {
	const [display, serif, mono] = await Promise.all([
		readFile(join(process.cwd(), "assets/fonts/BricolageGrotesque-Bold.ttf")),
		readFile(join(process.cwd(), "assets/fonts/InstrumentSerif-Italic.ttf")),
		readFile(join(process.cwd(), "assets/fonts/JetBrainsMono-Medium.ttf")),
	]);

	return new ImageResponse(
		(
			<div style={{ display: "flex", width: "100%", height: "100%", background: "#eeebe3", color: "#111214" }}>
				<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "64px 48px 56px 72px" }}>
					<div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 18, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5d5951" }}>
						<span style={{ color: "#b02f0a", marginRight: 12 }}>●</span> HAR analyzer · runs in your browser
					</div>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div style={{ display: "flex", flexDirection: "column", fontFamily: "Bricolage", fontSize: 124, lineHeight: 0.9, letterSpacing: "-0.04em" }}>
							<span>Request</span>
							<span>X-ray</span>
						</div>
						<div style={{ display: "flex", fontFamily: "Instrument", fontSize: 52, marginTop: 18 }}>
							<span>Count the calls.&nbsp;</span>
							<span style={{ color: "#b02f0a" }}>Find the waste.</span>
						</div>
					</div>
					<div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 18, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5d5951" }}>
						sujanrokad.com
					</div>
				</div>
				<div style={{ display: "flex", width: 430, margin: "40px 40px 40px 0", background: "#111214", borderRadius: 6, position: "relative" }}>
					<div style={{ position: "absolute", top: 22, left: 24, fontFamily: "JetBrains Mono", fontSize: 14, letterSpacing: "0.12em", color: "#9a968d" }}>
						EXPOSURE · 64 REQUESTS
					</div>
					{SPANS.map(([row, start, width, hot]) => (
						<div
							key={row}
							style={{
								position: "absolute",
								left: `${6 + start * 0.88}%`,
								top: 80 + row * 34,
								width: `${width * 0.88}%`,
								height: 12,
								borderRadius: 2,
								background: hot ? "#ff4d17" : "rgba(238,235,227,0.55)",
								boxShadow: hot ? "0 0 18px rgba(255,77,23,0.6)" : "none",
							}}
						/>
					))}
					<div style={{ position: "absolute", top: 60, bottom: 30, left: "58%", width: 2, background: "rgba(255,77,23,0.85)" }} />
				</div>
			</div>
		),
		{
			...size,
			fonts: [
				{ name: "Bricolage", data: display, weight: 700, style: "normal" },
				{ name: "Instrument", data: serif, weight: 400, style: "italic" },
				{ name: "JetBrains Mono", data: mono, weight: 500, style: "normal" },
			],
		},
	);
}
