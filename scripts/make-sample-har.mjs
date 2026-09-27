#!/usr/bin/env node
/**
 * Generates the synthetic sample HAR: a product listing page on a made-up
 * storefront ("Fernwood Outfitters") calling a made-up OData API. Every host is
 * under the reserved .example TLD, every token is fake, and the random data is
 * seeded so the file is reproducible.
 *
 * It is built to show each finding the tool can raise: a sequential chain, an
 * N+1 product lookup, duplicate cart calls, a slow and a failing endpoint,
 * missing compression and cache headers, an OData over-fetch, and a $batch.
 *
 *   node scripts/make-sample-har.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public/samples/fernwood-storefront.har");

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

let seed = 20260926;
function rand() {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 2 ** 32;
}
const between = (min, max) => Math.round((min + rand() * (max - min)) * 1000) / 1000;
const pick = (list) => list[Math.floor(rand() * list.length)];

const b64url = (value) => Buffer.from(value).toString("base64url");
const FAKE_JWT = [
	b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "sample-key" })),
	b64url(JSON.stringify({ sub: "sample-shopper", iss: "https://login.fernwood.example", aud: "api.fernwood.example", exp: 1893456000 })),
	b64url("not-a-real-signature-this-is-a-synthetic-sample"),
].join(".");
const COOKIE = "fw_session=SAMPLE-8a1f2c9e7b; fw_consent=analytics:0; fw_cart=SAMPLE-cart";

const START = Date.parse("2026-09-26T14:02:11.000Z");
const SHOP = "https://shop.fernwood.example";
const CDN = "https://cdn.fernwood.example";
const API = "https://api.fernwood.example";
const TAG = "https://tag.metrics.example";
const CHANNEL = 5637144592;
const CART_ID = "8f14e45f-ceea-467a-9575-0fc0a1e5b9d2";

// ---------------------------------------------------------------------------
// Entry builder
// ---------------------------------------------------------------------------

const entries = [];
const connected = new Set();

function headerList(map) {
	return Object.entries(map).map(([name, value]) => ({ name, value }));
}

function queryList(url) {
	return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
}

/**
 * @param {object} o
 */
function add(o) {
	const url = new URL(o.url);
	const origin = url.origin;
	const fresh = !connected.has(origin);
	connected.add(origin);

	const timings = {
		blocked: o.blocked ?? between(0.6, 3),
		dns: fresh ? between(12, 32) : -1,
		connect: fresh ? between(40, 70) : -1,
		ssl: fresh ? between(18, 30) : -1,
		send: between(0.1, 0.5),
		wait: o.wait,
		receive: o.receive,
		_blocked_queueing: 0.4,
	};
	const time = Object.entries(timings)
		.filter(([key, v]) => key !== "_blocked_queueing" && key !== "ssl" && v > 0)
		.reduce((sum, [, v]) => sum + v, 0);

	const text = o.text;
	const size = o.size ?? (typeof text === "string" ? Buffer.byteLength(text) : 0);
	const compressed = o.compressed ?? false;
	const headerBytes = 320;
	const transfer = o.fromCache ? 0 : o.status === 0 ? 0 : Math.round((compressed ? size * pick([0.18, 0.22, 0.26]) : size) + headerBytes);

	const mime = o.mime ?? "application/json";
	const resHeaders = {
		"content-type": mime,
		date: new Date(START + o.start).toUTCString(),
		...(compressed ? { "content-encoding": "br" } : {}),
		...o.resHeaders,
	};
	if (o.status === 0) for (const key of Object.keys(resHeaders)) delete resHeaders[key];

	const reqHeaders = {
		":authority": url.host,
		":method": o.method ?? "GET",
		":path": url.pathname + url.search,
		":scheme": "https",
		accept: o.accept ?? (o.type === "fetch" || o.type === "xhr" || o.type === "preflight" ? "application/json" : "*/*"),
		"accept-encoding": "gzip, deflate, br, zstd",
		"accept-language": "en-CA,en;q=0.9",
		"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
		...o.reqHeaders,
	};

	const entry = {
		_initiator: o.initiator ?? { type: "other" },
		_priority: o.priority ?? (o.type === "fetch" ? "High" : "Low"),
		_resourceType: o.type,
		cache: {},
		connection: String(Math.floor(between(100000, 999999))),
		pageref: "page_1",
		request: {
			method: o.method ?? "GET",
			url: o.url,
			httpVersion: "h2",
			headers: headerList(reqHeaders),
			queryString: queryList(o.url),
			cookies: [],
			headersSize: -1,
			bodySize: o.body ? Buffer.byteLength(o.body) : 0,
			...(o.body ? { postData: { mimeType: o.bodyMime ?? "application/json", text: o.body } } : {}),
		},
		response: {
			status: o.status ?? 200,
			statusText: o.statusText ?? (o.status === undefined || o.status === 200 ? "" : ""),
			httpVersion: "h2",
			headers: o.status === 0 ? [] : headerList(resHeaders),
			cookies: [],
			content: {
				size,
				mimeType: mime,
				...(text !== undefined ? { text } : {}),
				...(o.encoding ? { encoding: o.encoding } : {}),
			},
			redirectURL: "",
			headersSize: -1,
			bodySize: o.status === 0 ? -1 : transfer - headerBytes > 0 ? transfer - headerBytes : 0,
			_transferSize: transfer,
			_error: o.error ?? null,
			...(o.status === 0 ? {} : {}),
		},
		serverIPAddress: o.ip ?? { [SHOP]: "203.0.113.10", [CDN]: "203.0.113.24", [API]: "203.0.113.40", [TAG]: "198.51.100.7" }[origin],
		startedDateTime: new Date(START + o.start).toISOString(),
		time,
		timings,
		...(o.fromCache ? { _fromCache: o.fromCache } : {}),
	};
	entries.push(entry);
	return { entry, end: o.start + time };
}

function scriptInitiator(fn, line) {
	return {
		type: "script",
		stack: {
			callFrames: [
				{ functionName: fn, scriptId: "41", url: `${SHOP}/_app/main.5c2a8f3d.js`, lineNumber: line, columnNumber: 18 },
				{ functionName: "commitHookEffectListMount", scriptId: "38", url: `${SHOP}/_app/vendor.7d1e4b9a.js`, lineNumber: 1, columnNumber: 40211 },
			],
		},
	};
}

const apiHeaders = (extra = {}) => ({
	authorization: `Bearer ${FAKE_JWT}`,
	"odata-version": "4.0",
	"odata-maxversion": "4.0",
	origin: SHOP,
	referer: `${SHOP}/`,
	"sec-fetch-dest": "empty",
	"sec-fetch-mode": "cors",
	"sec-fetch-site": "same-site",
	...extra,
});

const apiResponse = (extra = {}) => ({
	"content-type": "application/json; odata.metadata=minimal; odata.streaming=true",
	"odata-version": "4.0",
	"cache-control": "no-cache",
	"access-control-allow-origin": SHOP,
	"access-control-allow-credentials": "true",
	"request-id": `${Math.floor(between(1e8, 9e8))}`,
	...extra,
});

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------

const COLORS = ["Moss", "Charcoal", "Clay", "Fog", "Pine", "Slate"];
const NAMES = [
	"Ridgeline Trail Runner",
	"Cedar Hollow Hiker",
	"Northbank Waterproof Boot",
	"Lakeshore Approach Shoe",
	"Timberline Mid GTX",
	"Brookside Slip-On",
	"Summit Pass Mountaineer",
	"Fernwood Everyday Sneaker",
	"Granite Creek Sandal",
	"Aspen Ridge Winter Boot",
	"Kettle Lake Trail Mid",
	"Driftwood Canvas Low",
	"Bluffside Speed Hiker",
	"Moraine Insulated Boot",
	"Heron Marsh Wader",
	"Coldwater Camp Moc",
	"Ironwood Work Boot",
	"Lichen Light Runner",
	"Shale Scramble Shoe",
	"Quarry Trail Low",
];

function product(id, index) {
	const price = Math.round(between(59, 219)) + 0.99;
	return {
		"@odata.etag": `W/"${Math.floor(between(1e5, 9e5))}"`,
		RecordId: id,
		ItemId: `FW-${10000 + index}`,
		Name: NAMES[index % NAMES.length],
		Description: `${NAMES[index % NAMES.length]} built for wet trails and long days. Recycled mesh upper, cushioned midsole and a grippy lug outsole.`,
		SearchName: NAMES[index % NAMES.length].toUpperCase(),
		ProductNumber: `FW${10000 + index}`,
		Price: price,
		BasePrice: price,
		AdjustedPrice: price,
		CustomerContextualPrice: price,
		Currency: "CAD",
		Color: pick(COLORS),
		Size: null,
		Style: pick(["Trail", "Hike", "Everyday", "Winter"]),
		Configuration: null,
		IsGiftCard: false,
		IsMasterProduct: true,
		MasterProductId: null,
		IsKit: false,
		IsRemote: false,
		PrimaryImageUrl: `${CDN}/products/${id}/primary.webp`,
		DefaultUnitOfMeasure: "ea",
		ItemTaxGroupId: "FULL",
		SalesTaxGroupId: "ON",
		ProductTypeValue: 4,
		HasLinkedProducts: false,
		IsDiscontinued: false,
		DisplayOrder: index,
		Rating: Math.round(between(3.4, 4.9) * 10) / 10,
		ReviewCount: Math.floor(between(3, 480)),
		WeightGrams: Math.floor(between(610, 1180)),
		CountryOfOrigin: pick(["CA", "PT", "VN", "IT"]),
		Materials: ["Recycled polyester mesh", "EVA midsole", "Rubber outsole"],
		CareInstructions: "Brush off dirt, rinse with cold water and air dry away from direct heat.",
		ChannelId: CHANNEL,
		CatalogId: 68719478001,
		CategoryIds: [68719478101, 68719478117, 68719478140],
		Dimensions: COLORS.slice(0, 4).map((color, i) => ({ DimensionTypeValue: 1, DimensionValue: { Value: color, RecordId: id + i + 1 } })),
		Behavior: {
			HasSerialNumber: false,
			IsDiscountAllowed: true,
			IsManualDiscountAllowed: true,
			IsKitDisassemblyAllowed: false,
			IsNegativeQuantityAllowed: false,
			IsReturnAllowed: true,
			IsSaleAtPhysicalStoresAllowed: true,
			IsZeroSalePriceAllowed: false,
			KeyInPriceValue: 0,
			KeyInQuantityValue: 0,
			MustKeyInComment: false,
			MustPrintIndividualShelfLabelsForVariants: false,
			MustPromptForSerialNumberOnlyAtSale: false,
			MustWeighProductAtSale: false,
			ValidFromDateForSaleAtPhysicalStores: "1900-01-01T00:00:00Z",
			ValidToDateForSaleAtPhysicalStores: "2154-12-31T00:00:00Z",
		},
		LongDescription: `<p>${NAMES[index % NAMES.length]} pairs a breathable recycled mesh upper with a waterproof membrane, so feet stay dry on wet trails without overheating on the climb.</p><ul><li>Waterproof, breathable membrane</li><li>Recycled mesh and suede upper</li><li>Dual-density EVA midsole</li><li>5 mm lugs for loose ground</li><li>Removable, washable insole</li></ul><p>Fit: true to size. Wide sizes available in selected colours.</p>`,
		Variants: ["7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12"].flatMap((size, s) =>
			COLORS.slice(0, 5).map((color, c) => ({
				RecordId: id * 100 + s * 3 + c,
				ItemId: `FW-${10000 + index}-${color.toUpperCase()}-${size}`,
				Size: size,
				Color: color,
				Barcode: `06${String(10000000000 + id + s * 3 + c).slice(-11)}`,
				InStock: rand() > 0.2,
				AdjustedPrice: price,
			})),
		),
		Images: [1, 2, 3, 4].map((n) => ({ Uri: `${CDN}/products/${id}/${n}.webp`, AltText: `${NAMES[index % NAMES.length]} view ${n}`, IsDefault: n === 1 })),
		ExtensionProperties: [
			{ Key: "WarrantyYears", Value: { IntegerValue: 2 } },
			{ Key: "Vegan", Value: { BooleanValue: rand() > 0.5 } },
		],
	};
}

function categoryTree(depth, prefix, breadth) {
	return Array.from({ length: breadth }, (_, i) => {
		const id = Number(`${prefix}${i + 10}`);
		return {
			RecordId: id,
			Name: `${pick(["Trail", "Hike", "Camp", "Winter", "Water", "Everyday", "Kids", "Sale"])} ${pick(["Footwear", "Jackets", "Packs", "Layers", "Accessories", "Socks", "Tents"])} ${i + 1}`,
			Slug: `/c/${prefix}${i}`,
			ParentCategory: Number(prefix) || 0,
			DisplayOrder: i,
			ImageUrl: `${CDN}/categories/${id}.webp`,
			Description: "Seasonal range selected for Canadian trails, city streets and everything between. Free returns within 60 days.",
			IsActive: true,
			Attributes: [
				{ Name: "Season", Value: pick(["All", "Winter", "Summer"]) },
				{ Name: "Audience", Value: pick(["Men", "Women", "Kids", "All"]) },
			],
			Children: depth > 0 ? categoryTree(depth - 1, `${prefix}${i + 10}`, breadth) : [],
		};
	});
}

// ---------------------------------------------------------------------------
// The page load
// ---------------------------------------------------------------------------

const html = `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><title>Trail Footwear · Fernwood Outfitters</title><link rel="stylesheet" href="/_app/site.9b3e1f7a.css"><script src="/_app/runtime.a3f9c2e1.js" defer></script><script src="/_app/vendor.7d1e4b9a.js" defer></script><script src="/_app/main.5c2a8f3d.js" defer></script></head><body><div id="root"></div>${"<!-- server-rendered product grid placeholder -->".repeat(600)}</body></html>`;

// Document
add({
	url: `${SHOP}/c/trail-footwear?sort=featured`,
	start: 0,
	wait: 268,
	receive: 42,
	type: "document",
	mime: "text/html",
	text: html,
	compressed: true,
	priority: "VeryHigh",
	accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	reqHeaders: { cookie: COOKIE, "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "upgrade-insecure-requests": "1" },
	resHeaders: {
		"cache-control": "private, no-cache",
		"set-cookie": "fw_session=SAMPLE-8a1f2c9e7b; Path=/; Secure; HttpOnly; SameSite=Lax",
		"content-security-policy": "default-src 'self' https://*.fernwood.example",
		"strict-transport-security": "max-age=63072000",
	},
});

const parser = (line) => ({ type: "parser", url: `${SHOP}/c/trail-footwear?sort=featured`, lineNumber: line });
const immutable = { "cache-control": "public, max-age=31536000, immutable" };

// Render-blocking CSS and deferred scripts
add({ url: `${SHOP}/_app/site.9b3e1f7a.css`, start: 392, wait: 38, receive: 26, type: "stylesheet", mime: "text/css", size: 86_412, compressed: true, resHeaders: immutable, initiator: parser(0), priority: "VeryHigh" });
add({ url: `${SHOP}/_app/runtime.a3f9c2e1.js`, start: 394, wait: 36, receive: 6, type: "script", mime: "application/javascript", size: 11_874, compressed: true, resHeaders: immutable, initiator: parser(0) });
add({ url: `${SHOP}/_app/vendor.7d1e4b9a.js`, start: 395, wait: 58, receive: 296, type: "script", mime: "application/javascript", size: 1_368_220, compressed: true, resHeaders: immutable, initiator: parser(0) });
add({ url: `${SHOP}/_app/main.5c2a8f3d.js`, start: 396, wait: 51, receive: 104, type: "script", mime: "application/javascript", size: 243_906, compressed: true, resHeaders: immutable, initiator: parser(0) });

// Third-party analytics (separate site)
add({ url: `${TAG}/t.js?id=FW-SAMPLE`, start: 399, wait: 88, receive: 18, type: "script", mime: "application/javascript", size: 48_220, compressed: true, resHeaders: { "cache-control": "public, max-age=300" }, initiator: parser(0) });

// Fonts from CSS
const cssInitiator = { type: "parser", url: `${SHOP}/_app/site.9b3e1f7a.css`, lineNumber: 0 };
add({ url: `${SHOP}/fonts/grotesk-regular.woff2`, start: 468, wait: 34, receive: 12, type: "font", mime: "font/woff2", size: 38_104, resHeaders: immutable, initiator: cssInitiator, priority: "VeryHigh" });
add({ url: `${SHOP}/fonts/grotesk-semibold.woff2`, start: 469, wait: 35, receive: 14, type: "font", mime: "font/woff2", size: 40_880, resHeaders: immutable, initiator: cssInitiator, priority: "VeryHigh" });

// CDN images without cache headers
add({ url: `${CDN}/campaign/fall-trail-hero.jpg`, start: 474, wait: 64, receive: 548, type: "image", mime: "image/jpeg", size: 1_624_310, initiator: parser(0), priority: "High" });
add({
	url: `${CDN}/brand/fernwood-logo.svg`,
	start: 476,
	wait: 30,
	receive: 3,
	type: "image",
	mime: "image/svg+xml",
	text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 48">${'<path d="M4 4h40v40H4z" fill="#2f4a2c"/>'.repeat(90)}</svg>`,
	initiator: parser(0),
});

// Preflights for the cross-site API
const preflight = (path, start) =>
	add({
		url: `${API}${path}`,
		method: "OPTIONS",
		start,
		wait: between(14, 22),
		receive: 0.4,
		type: "preflight",
		mime: "",
		size: 0,
		reqHeaders: { "access-control-request-method": "GET", "access-control-request-headers": "authorization,odata-maxversion,odata-version", origin: SHOP },
		resHeaders: { "access-control-allow-origin": SHOP, "access-control-allow-headers": "authorization,odata-maxversion,odata-version,content-type", "access-control-allow-methods": "GET,POST,PATCH,DELETE" },
		initiator: { type: "preflight" },
	});

// --- The sequential chain: four independent calls awaited one by one in a loader ---
preflight("/api/Customers/Me", 742);
let t = 760;
const me = add({
	url: `${API}/api/Customers/Me?api-version=7.3`,
	start: t,
	wait: 226,
	receive: 11,
	type: "fetch",
	compressed: true,
	reqHeaders: apiHeaders(),
	resHeaders: apiResponse(),
	initiator: scriptInitiator("loadPageContext", 1),
	text: JSON.stringify({
		"@odata.context": `${API}/api/$metadata#Customers/$entity`,
		AccountNumber: "C-004021",
		FirstName: "Sample",
		LastName: "Shopper",
		Email: "sample.shopper@fernwood.example",
		CustomerGroup: "Retail",
		Language: "en-ca",
		LoyaltyTier: "Trailblazer",
		AllowOnAccountPayment: false,
	}),
});
t = me.end + 14;
const config = add({
	url: `${API}/api/Channels(${CHANNEL})/Configuration?api-version=7.3`,
	start: t,
	wait: 352,
	receive: 21,
	type: "fetch",
	compressed: true,
	reqHeaders: apiHeaders(),
	resHeaders: apiResponse(),
	initiator: scriptInitiator("loadPageContext", 1),
	text: JSON.stringify({
		"@odata.context": `${API}/api/$metadata#ChannelConfiguration/$entity`,
		ChannelId: CHANNEL,
		Currency: "CAD",
		PriceIncludesSalesTax: false,
		DefaultLanguageId: "en-ca",
		PickupDeliveryModeCode: "PICKUP",
		EmailDeliveryModeCode: "EMAIL",
		InventAvailabilityCheck: true,
		CountryRegionISOCode: "CA",
		Features: ["Wishlist", "Reviews", "StorePickup", "Loyalty"],
	}),
});
t = config.end + 12;
const promotions = add({
	url: `${API}/api/Promotions?$filter=${encodeURIComponent(`IsActive eq true and ChannelId eq ${CHANNEL} and (Audience eq 'All' or Audience eq 'Trailblazer')`)}&$select=Id,Name,BannerText,ValidTo&api-version=7.3`,
	start: t,
	wait: 402,
	receive: 44,
	type: "fetch",
	compressed: false,
	reqHeaders: apiHeaders(),
	resHeaders: apiResponse(),
	initiator: scriptInitiator("loadPageContext", 1),
	text: JSON.stringify({
		"@odata.context": `${API}/api/$metadata#Promotions(Id,Name,BannerText,ValidTo)`,
		value: Array.from({ length: 480 }, (_, i) => ({
			Id: `PR-${2000 + i}`,
			Name: `${pick(["Fall", "Trail", "Member", "Bundle", "Clearance"])} offer ${i + 1}`,
			BannerText: "Save on selected trail footwear this week. Members get free shipping on orders over $75 and free returns within 60 days.",
			ValidTo: "2026-10-31T23:59:59Z",
		})),
	}),
});
t = promotions.end + 17;
add({
	url: `${API}/api/Navigation/Categories?$expand=${encodeURIComponent("Children($expand=Children)")}&api-version=7.3`,
	start: t,
	wait: 186,
	receive: 452,
	type: "fetch",
	compressed: false,
	reqHeaders: apiHeaders(),
	resHeaders: apiResponse(),
	initiator: scriptInitiator("loadPageContext", 1),
	text: JSON.stringify({ "@odata.context": `${API}/api/$metadata#Categories`, value: categoryTree(2, "6871947", 12) }),
});

// --- Cart: fetched by four components; the first result feeds the cart lines call ---
preflight("/api/Carts/Current", 752);
const cartBody = JSON.stringify({
	"@odata.context": `${API}/api/$metadata#Carts/$entity`,
	Id: CART_ID,
	CustomerId: "C-004021",
	TotalItems: 2,
	SubtotalAmount: 318.98,
	TotalAmount: 360.45,
	TaxAmount: 41.47,
	CartTypeValue: 1,
	ModifiedDateTime: "2026-09-26T13:58:40Z",
});
const cartUrl = `${API}/api/Carts/Current?api-version=7.3`;
const cartCall = (start, fn, line) =>
	add({ url: cartUrl, start, wait: between(150, 175), receive: 4, type: "fetch", compressed: true, reqHeaders: apiHeaders(), resHeaders: apiResponse(), initiator: scriptInitiator(fn, line), text: cartBody });
const firstCart = cartCall(771, "useCart", 1);
cartCall(778, "MiniCartBadge", 1);

// Real dependency: cart lines need the cart id from the first response.
add({
	url: `${API}/api/Carts('${CART_ID}')/CartLines?$expand=Product($select=Name,PrimaryImageUrl)&api-version=7.3`,
	start: firstCart.end + 11,
	wait: 184,
	receive: 7,
	type: "fetch",
	compressed: true,
	reqHeaders: apiHeaders(),
	resHeaders: apiResponse(),
	initiator: scriptInitiator("useCartLines", 1),
	text: JSON.stringify({
		"@odata.context": `${API}/api/$metadata#CartLines`,
		value: [
			{ LineId: "L1", ProductId: 68719478279, Quantity: 1, Price: 189.99, Product: { Name: "Ridgeline Trail Runner", PrimaryImageUrl: `${CDN}/products/68719478279/primary.webp` } },
			{ LineId: "L2", ProductId: 68719478281, Quantity: 1, Price: 128.99, Product: { Name: "Lakeshore Approach Shoe", PrimaryImageUrl: `${CDN}/products/68719478281/primary.webp` } },
		],
	}),
});

// --- Search: the OData query worth decoding ---
const searchFilter =
	"CategoryId eq 68719478117 and (Color eq 'Moss' or Color eq 'Charcoal' or Color eq 'Pine') and Price ge 40 and Price le 180 and Attributes/any(a: a/Name eq 'Waterproof' and a/Value eq 'true') and not startswith(Name, 'Kids')";
const searchResults = Array.from({ length: 20 }, (_, i) => ({ Id: 68719478270 + i, Name: NAMES[i], Price: Math.round(between(59, 179)) + 0.99, PrimaryImageUrl: `${CDN}/products/${68719478270 + i}/primary.webp` }));
add({
	url: `${API}/api/Products/Search?$filter=${encodeURIComponent(searchFilter)}&$select=Id,Name,Price,PrimaryImageUrl&$expand=${encodeURIComponent("Variants($select=Id,Size,Color;$filter=InStock eq true;$top=5)")}&$orderby=${encodeURIComponent("Rating desc,Price asc")}&$top=20&$skip=0&$count=true&api-version=7.3`,
	start: 790,
	wait: 296,
	receive: 14,
	type: "fetch",
	compressed: true,
	reqHeaders: apiHeaders(),
	resHeaders: apiResponse(),
	initiator: scriptInitiator("useProductSearch", 1),
	text: JSON.stringify({ "@odata.context": `${API}/api/$metadata#Products(Id,Name,Price,PrimaryImageUrl)`, "@odata.count": 146, value: searchResults }),
});

// --- N+1: each product tile loads its own product record, in full ---
for (let i = 0; i < 20; i++) {
	const id = 68719478270 + i;
	const body = JSON.stringify({ "@odata.context": `${API}/api/$metadata#Products/$entity`, ...product(id, i) });
	add({
		url: `${API}/api/Products(${id})?$expand=Images&api-version=7.3`,
		start: 1122 + i * 34 + between(0, 4),
		wait: between(150, 235),
		receive: between(4, 12),
		type: "fetch",
		compressed: true,
		reqHeaders: apiHeaders(),
		resHeaders: apiResponse(),
		initiator: scriptInitiator("ProductTile.useProduct", 1),
		text: body,
	});
}

// Product images for the tiles: no cache headers on the CDN
for (let i = 0; i < 12; i++) {
	const id = 68719478270 + i;
	add({ url: `${CDN}/products/${id}/primary.webp`, start: 1150 + i * 22, wait: between(40, 70), receive: between(20, 60), type: "image", mime: "image/webp", size: Math.floor(between(38_000, 74_000)), initiator: parser(0), priority: "Low" });
}

// --- Inventory: two components post the same body at the same time ---
const inventoryBody = JSON.stringify({ ProductIds: searchResults.slice(0, 8).map((p) => p.Id), ChannelId: CHANNEL, IncludeStorePickup: true });
for (const [start, fn] of [[1442, "StockBadge"], [1449, "PickupPromo"]]) {
	add({
		url: `${API}/api/Products/GetEstimatedAvailability?api-version=7.3`,
		method: "POST",
		body: inventoryBody,
		start,
		wait: between(138, 150),
		receive: 5,
		type: "fetch",
		compressed: true,
		reqHeaders: apiHeaders({ "content-type": "application/json" }),
		resHeaders: apiResponse(),
		initiator: scriptInitiator(fn, 1),
		text: JSON.stringify({ "@odata.context": `${API}/api/$metadata#Collection(ProductAvailability)`, value: searchResults.slice(0, 8).map((p) => ({ ProductId: p.Id, AvailableQuantity: Math.floor(between(0, 40)) })) }),
	});
}

// --- Slow: personalised recommendations wait on a cold model server ---
add({
	url: `${API}/api/Recommendations?customerAccount=C-004021&placement=plp-bottom&count=12&api-version=7.3`,
	start: 1106,
	wait: 3240,
	receive: 22,
	type: "fetch",
	compressed: true,
	reqHeaders: apiHeaders(),
	resHeaders: apiResponse(),
	initiator: scriptInitiator("RecommendationsRail", 1),
	text: JSON.stringify({ value: searchResults.slice(4, 16).map((p) => ({ ProductId: p.Id, Score: Math.round(between(0.4, 0.99) * 100) / 100 })) }),
});

// --- $batch: delivery info in one round trip ---
const batchBoundary = "batch_7f3a2c";
const batchBody = [
	`--${batchBoundary}`,
	"Content-Type: application/http",
	"Content-Transfer-Encoding: binary",
	"",
	`GET DeliveryOptions?$filter=${encodeURIComponent("PostalCode eq 'L8P 4R5'")}&api-version=7.3 HTTP/1.1`,
	"Accept: application/json",
	"",
	"",
	`--${batchBoundary}`,
	"Content-Type: application/http",
	"Content-Transfer-Encoding: binary",
	"",
	`GET OrgUnits/GetStoreHours(storeNumbers=['HAM01','BUR02'])?api-version=7.3 HTTP/1.1`,
	"Accept: application/json",
	"",
	"",
	`--${batchBoundary}`,
	"Content-Type: multipart/mixed; boundary=changeset_1d9e",
	"",
	"--changeset_1d9e",
	"Content-Type: application/http",
	"Content-Transfer-Encoding: binary",
	"Content-ID: 1",
	"",
	`PATCH Carts('${CART_ID}') HTTP/1.1`,
	"Content-Type: application/json",
	"",
	JSON.stringify({ DeliveryMode: "PICKUP", ShippingAddress: null }),
	"--changeset_1d9e--",
	`--${batchBoundary}--`,
	"",
].join("\r\n");
const batchResponse = [
	"--batchresponse_19c2",
	"Content-Type: application/http",
	"",
	"HTTP/1.1 200 OK",
	"Content-Type: application/json; odata.metadata=minimal",
	"",
	JSON.stringify({ value: [{ Code: "PICKUP", Description: "Pick up in store" }, { Code: "STD", Description: "Standard shipping, 3 to 5 days" }] }),
	"--batchresponse_19c2",
	"Content-Type: application/http",
	"",
	"HTTP/1.1 200 OK",
	"Content-Type: application/json; odata.metadata=minimal",
	"",
	JSON.stringify({ value: [{ StoreNumber: "HAM01", Opens: "10:00", Closes: "21:00" }, { StoreNumber: "BUR02", Opens: "10:00", Closes: "20:00" }] }),
	"--batchresponse_19c2",
	"Content-Type: multipart/mixed; boundary=changesetresponse_77a1",
	"",
	"--changesetresponse_77a1",
	"Content-Type: application/http",
	"Content-ID: 1",
	"",
	"HTTP/1.1 204 No Content",
	"",
	"",
	"--changesetresponse_77a1--",
	"--batchresponse_19c2--",
	"",
].join("\r\n");
add({
	url: `${API}/api/$batch`,
	method: "POST",
	body: batchBody,
	bodyMime: `multipart/mixed; boundary=${batchBoundary}`,
	start: 2094,
	wait: 212,
	receive: 6,
	type: "fetch",
	mime: "multipart/mixed; boundary=batchresponse_19c2",
	compressed: true,
	reqHeaders: apiHeaders({ "content-type": `multipart/mixed; boundary=${batchBoundary}` }),
	resHeaders: apiResponse({ "content-type": "multipart/mixed; boundary=batchresponse_19c2" }),
	initiator: scriptInitiator("DeliveryPicker", 1),
	text: batchResponse,
});

// --- Cart again: two more components ask for the same cart later ---
cartCall(2240, "CheckoutButton", 1);
cartCall(2716, "RecentlyViewedRail", 1);

// --- Errors ---
add({
	url: `${API}/api/Reviews/Summary?productIds=${searchResults.slice(0, 12).map((p) => p.Id).join(",")}&api-version=7.3`,
	start: 2310,
	wait: 128,
	receive: 3,
	type: "fetch",
	status: 500,
	statusText: "Internal Server Error",
	compressed: true,
	reqHeaders: apiHeaders(),
	resHeaders: apiResponse(),
	initiator: scriptInitiator("ReviewStars", 1),
	text: JSON.stringify({ error: { code: "Fernwood.Reviews.StorageTimeout", message: "Timeout expired while reading review aggregates.", target: "Reviews/Summary" } }),
});
add({ url: `${SHOP}/apple-touch-icon.png`, start: 2402, wait: 22, receive: 1, type: "other", mime: "text/html", status: 404, statusText: "Not Found", size: 0, initiator: { type: "other" } });
add({ url: `${API}/api/Products/Suggest?q=tra&api-version=7.3`, start: 2620, wait: 40, receive: 0, type: "fetch", status: 0, error: "net::ERR_ABORTED", size: 0, reqHeaders: apiHeaders(), initiator: scriptInitiator("SearchBox.onInput", 1) });
add({ url: `${API}/api/Products/Suggest?q=trail&api-version=7.3`, start: 2688, wait: 96, receive: 3, type: "fetch", compressed: true, reqHeaders: apiHeaders(), resHeaders: apiResponse(), initiator: scriptInitiator("SearchBox.onInput", 1), text: JSON.stringify({ value: ["trail runner", "trail mid", "trail socks"] }) });

// Analytics beacon
add({ url: `${TAG}/collect?v=2&tid=FW-SAMPLE&en=page_view`, method: "POST", body: "", start: 2460, wait: 42, receive: 0.3, type: "ping", mime: "text/plain", status: 204, statusText: "No Content", size: 0, initiator: { type: "script", stack: { callFrames: [{ functionName: "send", url: `${TAG}/t.js?id=FW-SAMPLE`, lineNumber: 0, columnNumber: 912 }] } } });

// Logo again from memory cache (not a duplicate call: it never hit the network)
add({ url: `${CDN}/brand/fernwood-logo.svg`, start: 2900, wait: 0.2, receive: 0.1, type: "image", mime: "image/svg+xml", size: 16_390, fromCache: "memory", initiator: parser(0) });

// ---------------------------------------------------------------------------

entries.sort((a, b) => Date.parse(a.startedDateTime) - Date.parse(b.startedDateTime));

const har = {
	log: {
		version: "1.2",
		creator: { name: "Request X-ray sample generator", version: "1.0" },
		browser: { name: "Synthetic", version: "1.0" },
		pages: [
			{
				startedDateTime: new Date(START).toISOString(),
				id: "page_1",
				title: `${SHOP}/c/trail-footwear?sort=featured`,
				pageTimings: { onContentLoad: 812.4, onLoad: 1262.7 },
			},
		],
		entries,
		comment: "Synthetic sample. Every host, token and record in this file is made up.",
	},
};

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(har, null, 1);
writeFileSync(OUT, json);
console.log(`Wrote ${entries.length} entries, ${(json.length / 1024).toFixed(0)} KB → ${OUT}`);
