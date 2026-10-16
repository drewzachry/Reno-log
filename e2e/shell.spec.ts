import { expect, test } from "@playwright/test";
import { startProject } from "./helpers";

test("tab bar navigates and fits a phone", async ({ page }) => {
  await startProject(page, "shell@example.com", "Shell", "Shell test");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Chat" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Decide" }).click();
  await expect(page).toHaveURL(/\/decisions$/);
  await expect(page.getByRole("heading", { name: "Decisions" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Decide" })).toHaveAttribute("aria-current", "page");

  for (const link of await nav.getByRole("link").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // The page itself never scrolls in either direction; only the content area does,
  // so the header can't slide under the iOS status bar.
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { x: el.scrollWidth > window.innerWidth, y: el.scrollHeight > window.innerHeight };
  });
  expect(overflow).toEqual({ x: false, y: false });
});

test("is installable: manifest, icons and service worker are public", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src, { maxRedirects: 0 })).ok()).toBe(true);
  }
  for (const path of ["/icons/apple-touch-icon.png", "/sw.js"]) {
    expect((await request.get(path, { maxRedirects: 0 })).ok()).toBe(true);
  }
});
