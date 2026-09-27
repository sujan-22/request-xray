import { Bricolage_Grotesque, Instrument_Serif, JetBrains_Mono } from "next/font/google";

export const bricolage = Bricolage_Grotesque({
	subsets: ["latin"],
	variable: "--font-bricolage",
	axes: ["opsz"],
	display: "swap",
});

export const instrument = Instrument_Serif({
	subsets: ["latin"],
	weight: "400",
	style: ["normal", "italic"],
	variable: "--font-instrument",
	display: "swap",
});

export const jetbrains = JetBrains_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-jetbrains",
	display: "swap",
});
