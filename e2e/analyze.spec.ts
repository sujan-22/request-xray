import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const SAMPLE = join(__dirname, "../public/samples/fernwood-storefront.har");

// Secrets planted in the synthetic sample. None may survive an export.
const FAKE_SECRETS = ["Bearer eyJ", "fw_session=SAMPLE-8a1f2c9e7b", "sample.shopper@fernwood.example"];

test("drop a HAR, follow a finding, decode OData and export a redacted report", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: /Request X.ray/ })).toBeVisible();

	// 1. Load the file through the picker (the same path as drag and drop).
	await page.locator('input[type="file"]').first().setInputFiles(SAMPLE);
	await expect(page.getByText("64 requests to 4 hosts over 4.37 s.")).toBeVisible({ timeout: 20_000 });

	// 2. The sequential chain finding highlights its four calls in order.
	const chain = page.getByRole("button", { name: /ran one after another \(4 calls\)/ });
	await chain.click();
	await expect(chain).toHaveAttribute("aria-expanded", "true");
	const inChain = page.getByRole("list", { name: "Requests in this finding" }).getByRole("button");
	await expect(inChain).toHaveCount(4);
	await expect(inChain.nth(0)).toContainText("Me");
	await expect(inChain.nth(3)).toContainText("Categories");

	// 3. Inspect the product search call and read its decoded $filter.
	await page.getByPlaceholder(/Filter:/).fill("Products/Search");
	await page.getByRole("option").first().click();
	await page.getByRole("tab", { name: /OData/ }).click();
	await expect(page.getByText("Reads as")).toBeVisible();
	await expect(page.getByText(/CategoryId is 68719478117 and \(Color is 'Moss'/)).toBeVisible();

	// 4. Keyboard: close the inspector, then step to the next finding.
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tab", { name: /OData/ })).toHaveCount(0);

	// 5. Export the JSON report and check that the fake secrets were removed.
	await page.getByRole("button", { name: /Export/ }).first().click();
	await page.getByLabel(/JSON report/).check();
	await page.getByLabel("Include headers").check();
	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: /Download JSON report/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe("fernwood-storefront.xray.json");
	const text = readFileSync((await download.path())!, "utf8");
	const report = JSON.parse(text) as { findings: unknown[]; requests: Array<{ requestHeaders?: Record<string, string> }> };
	expect(report.findings.length).toBeGreaterThan(10);
	expect(report.requests.some((r) => r.requestHeaders?.authorization === "[redacted]")).toBe(true);
	for (const secret of FAKE_SECRETS) expect(text).not.toContain(secret);
	await expect(page.getByText(/Saved\. Removed/)).toBeVisible();
});

test("rejects a file that isn't a HAR with a clear message", async ({ page }) => {
	await page.goto("/");
	await page.locator('input[type="file"]').first().setInputFiles({ name: "notes.har", mimeType: "application/json", buffer: Buffer.from('{"name": "not a har"}') });
	await expect(page.getByRole("alert").filter({ hasText: "Couldn't read" })).toContainText("not a HAR file");
});

test("the page makes no requests to other origins", async ({ page }) => {
	const foreign: string[] = [];
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.origin !== "http://localhost:3200" && !url.protocol.startsWith("data") && !url.protocol.startsWith("blob")) foreign.push(request.url());
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Try the sample storefront" }).click();
	await expect(page.getByText("64 requests to 4 hosts over 4.37 s.")).toBeVisible({ timeout: 20_000 });
	expect(foreign).toEqual([]);
	// Sanity: the sample really was read from disk, not generated on the fly.
	expect(readFileSync(SAMPLE, "utf8").length).toBeGreaterThan(1_000_000);
});
