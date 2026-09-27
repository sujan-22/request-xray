import type { Metadata, Viewport } from "next";
import { bricolage, instrument, jetbrains } from "@/lib/fonts";
import "./globals.css";

const title = "Request X-ray · See what a page did on the network";
const description =
	"Drop a HAR file and get a clear report: every request on one timeline, grouped endpoints, and findings for duplicate calls, sequential chains, slow and oversized responses. Runs entirely in your browser.";

export const metadata: Metadata = {
	title: { default: title, template: "%s · Request X-ray" },
	description,
	applicationName: "Request X-ray",
	authors: [{ name: "Sujan Rokad", url: "https://sujanrokad.com" }],
	creator: "Sujan Rokad",
	keywords: ["HAR analyzer", "HAR viewer", "network waterfall", "OData", "duplicate API calls", "web performance", "DevTools"],
	openGraph: { type: "website", title, description, siteName: "Request X-ray" },
	twitter: { card: "summary_large_image", title, description },
	robots: { index: true, follow: true },
	formatDetection: { email: false, address: false, telephone: false },
};

export const viewport: Viewport = {
	themeColor: "#111214",
	colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${bricolage.variable} ${instrument.variable} ${jetbrains.variable}`}>
			<body>{children}</body>
		</html>
	);
}
