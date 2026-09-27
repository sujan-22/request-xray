import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function audit(page: Page) {
	const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
	const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes[0]?.target.join(" ")} :: ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`);
	expect(summary).toEqual([]);
}

test("landing page meets WCAG 2.1 AA", async ({ page }) => {
	await page.goto("/");
	await page.emulateMedia({ reducedMotion: "reduce" });
	await audit(page);
});

test("workspace, inspector and dialogs meet WCAG 2.1 AA", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/?sample");
	await expect(page.getByText("64 requests to 4 hosts over 4.37 s.")).toBeVisible({ timeout: 20_000 });
	await page.getByRole("button", { name: /ran one after another/ }).click();
	await page.getByRole("option").nth(15).click();
	await audit(page);
	await page.getByRole("tab", { name: /OData/ }).click();
	await audit(page);
	await page.keyboard.press("Escape");
	await page.keyboard.press("2");
	await audit(page);
	await page.keyboard.press("e");
	await audit(page);
	await page.keyboard.press("Escape");
	await page.keyboard.press("t");
	await audit(page);
	await page.keyboard.press("Escape");
	await page.keyboard.press("?");
	await audit(page);
	await page.keyboard.press("Escape");
});

test("request diff meets WCAG 2.1 AA", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/?sample");
	await expect(page.getByText("64 requests to 4 hosts over 4.37 s.")).toBeVisible({ timeout: 20_000 });
	await page.getByRole("button", { name: /was called 20 times/ }).click();
	await page.getByRole("button", { name: "Compare first two" }).click();
	await expect(page.getByText("Response body")).toBeVisible();
	await expect(page.getByText(/changed lines/).first()).toBeVisible();
	await audit(page);
});
