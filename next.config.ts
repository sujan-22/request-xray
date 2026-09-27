import type { NextConfig } from "next";

/*
 * Request X-ray is a static, client-only tool. A HAR file never leaves the
 * browser, so the security headers also lock the page out of talking to
 * anything but its own origin.
 */
const securityHeaders = [
	{
		key: "Content-Security-Policy",
		value: [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: blob:",
			"font-src 'self'",
			"connect-src 'self'" + (process.env.NODE_ENV === "development" ? " ws:" : ""),
			"worker-src 'self' blob:",
			"frame-ancestors 'none'",
			"base-uri 'self'",
			"form-action 'none'",
		].join("; "),
	},
	{ key: "Referrer-Policy", value: "no-referrer" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	// CLAUDE.md is hand-written for this project; don't let `next dev` append to it.
	agentRules: false,
	async headers() {
		return [{ source: "/:path*", headers: securityHeaders }];
	},
};

export default nextConfig;
