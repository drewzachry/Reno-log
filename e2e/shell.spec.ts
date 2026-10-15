import { expect, test } from "@playwright/test";

test("tab bar navigates between the main screens", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Chat" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Decide" }).click();
  await expect(page).toHaveURL(/\/decisions$/);
  await expect(page.getByRole("heading", { name: "Decisions" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Decide" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Log" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
});

test("tab targets are at least 44px tall and the page doesn't scroll sideways", async ({
  page,
}) => {
  await page.goto("/");
  for (const link of await page.getByRole("navigation", { name: "Main" }).getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("is installable: manifest and icons are served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
  expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBe(true);
  expect((await request.get("/sw.js")).ok()).toBe(true);
});
