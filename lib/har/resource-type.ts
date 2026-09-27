import type { ResourceType } from "../model";
import { baseMime, type HeaderMap } from "./headers";

/** Chrome's _resourceType values, mapped onto the smaller set the UI shows. */
const CHROME_TYPES: Record<string, ResourceType> = {
	document: "document",
	xhr: "api",
	fetch: "api",
	preflight: "api",
	eventsource: "api",
	script: "script",
	stylesheet: "style",
	image: "image",
	font: "font",
	media: "media",
	websocket: "other",
	manifest: "other",
	ping: "other",
	texttrack: "other",
	"signed-exchange": "other",
	cspviolationreport: "other",
};

const EXTENSIONS: Array<[RegExp, ResourceType]> = [
	[/\.(m?js|cjs)$/, "script"],
	[/\.css$/, "style"],
	[/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?)$/, "image"],
	[/\.(woff2?|ttf|otf|eot)$/, "font"],
	[/\.(mp4|webm|ogg|mp3|wav|m3u8|m4s|mpd|aac|flac|mov)$/, "media"],
	[/\.html?$/, "document"],
];

function fromMime(mime: string): ResourceType | null {
	if (!mime) return null;
	if (mime === "text/html" || mime === "application/xhtml+xml") return "document";
	if (/javascript|ecmascript/.test(mime)) return "script";
	if (mime === "text/css") return "style";
	if (mime.startsWith("image/")) return "image";
	if (mime.startsWith("font/") || /font|woff/.test(mime)) return "font";
	if (mime.startsWith("audio/") || mime.startsWith("video/") || mime === "application/vnd.apple.mpegurl") return "media";
	if (/json|xml|graphql|multipart\/mixed|text\/plain|x-www-form-urlencoded/.test(mime)) return "api";
	return null;
}

export function resourceType(
	chromeType: string | undefined,
	method: string,
	pathname: string,
	mimeType: string | undefined,
	reqHeaders: HeaderMap,
): ResourceType {
	if (chromeType) {
		const mapped = CHROME_TYPES[chromeType.toLowerCase()];
		if (mapped) return mapped;
	}

	// Firefox and Safari exports have no resource type, so infer it.
	const dest = reqHeaders["sec-fetch-dest"];
	if (dest) {
		if (dest === "document" || dest === "iframe") return "document";
		if (dest === "script" || dest === "worker" || dest === "serviceworker") return "script";
		if (dest === "style") return "style";
		if (dest === "image") return "image";
		if (dest === "font") return "font";
		if (dest === "audio" || dest === "video" || dest === "track") return "media";
		if (dest === "empty") return "api";
	}

	if (method === "OPTIONS") return "api";
	if (reqHeaders["x-requested-with"] === "XMLHttpRequest") return "api";

	const byMime = fromMime(baseMime(mimeType));
	if (byMime) return byMime;

	const lower = pathname.toLowerCase();
	for (const [pattern, type] of EXTENSIONS) if (pattern.test(lower)) return type;

	if (/json/.test(reqHeaders["accept"] ?? "") || method !== "GET") return "api";
	return "other";
}
