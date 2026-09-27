import { isTextMime } from "./headers";
import type { HarEntry } from "./types";

function decodeBase64(value: string): Uint8Array | null {
	try {
		const binary = atob(value.replace(/\s+/g, ""));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

/** The response body as text, decoding base64 when the content is textual. Null for binary or missing bodies. */
export function responseText(raw: HarEntry): string | null {
	const content = raw.response?.content;
	if (!content || typeof content.text !== "string") return null;
	if (content.encoding === "base64") {
		if (!isTextMime(content.mimeType)) return null;
		const bytes = decodeBase64(content.text);
		return bytes ? new TextDecoder().decode(bytes) : null;
	}
	return content.text;
}

/** A data: URL for image bodies, so the inspector can preview them. */
export function responseImageDataUrl(raw: HarEntry): string | null {
	const content = raw.response?.content;
	if (!content?.text || !content.mimeType?.startsWith("image/")) return null;
	if (content.encoding === "base64") return `data:${content.mimeType};base64,${content.text.replace(/\s+/g, "")}`;
	if (content.mimeType.startsWith("image/svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content.text)}`;
	return null;
}

/** The request body as text: postData.text, or its params form-encoded. */
export function requestText(raw: HarEntry): string | null {
	const post = raw.request?.postData;
	if (!post) return null;
	if (typeof post.text === "string") return post.text;
	if (Array.isArray(post.params) && post.params.length) {
		return post.params
			.map((param) => `${encodeURIComponent(param.name ?? "")}=${encodeURIComponent(param.value ?? "")}`)
			.join("&");
	}
	return null;
}
