import { afterWelcome, expect, test } from "./test";

test("the sidebar collapses to icons, stays that way after a reload, and opens again", async ({ page }) => {
  await page.goto("/");
  await afterWelcome(page);
  const sidebar = page.locator("aside");
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(64);
  // Icons still navigate, with the page's name on hover.
  await expect(sidebar.getByRole("link", { name: "Reports" })).toHaveAttribute("title", "Reports");

  await page.reload();
  await afterWelcome(page);
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await sidebar.getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();

  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(224);
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
});
