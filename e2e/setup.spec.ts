import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { signIn, startProject } from "./helpers";

// Phase 5 acceptance (docs/BUILD_PLAN.md), with the scripted Claude in
// e2e/stack/fake-claude.mjs: documents prefill the questions, the preview
// shows what will be added, saving builds the project, and running setup on
// a project that already has things only adds.

test.describe.configure({ timeout: 150_000 });
const SLOW = { timeout: 45_000 };

async function contract() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [
    [
      "Construction contract for 45 Earle.",
      "Contract price: $285,000.",
      "Completion date: 2027-05-14.",
    ],
    [
      "Allowance: Tile $9,000.",
      "Selected: Kitchen sink and faucet = Kohler Purist faucet and 33-inch sink.",
    ],
  ];
  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    lines.forEach((l, i) => page.drawText(l, { x: 40, y: 740 - i * 20, size: 11, font }));
  }
  return Buffer.from(await doc.save());
}

/** Waits for the page's own polling to show text. */
async function waitFor(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible(SLOW);
}
const waitForPreview = (page: Page) =>
  expect(page.getByRole("heading", { name: "Your decision map", exact: true })).toBeVisible(SLOW);

test("a new project is built from its contract, with a preview first", async ({ page }) => {
  await startProject(page, "earle@example.com", "Drew", "45 Earle");
  await page.goto("/");
  await page.getByRole("link", { name: /Set up your project/ }).click();
  await page.waitForURL(/\/plan$/);

  await page.getByLabel("Add documents").setInputFiles({
    name: "Contract.pdf",
    mimeType: "application/pdf",
    buffer: await contract(),
  });
  await waitFor(page, "Read ✓");
  await page.reload();
  await expect(page.getByLabel("Contract price")).toHaveValue("285,000");
  await expect(page.getByLabel("Target move-in")).toHaveValue("2027-05-14");
  await expect(page.getByLabel("Allowances in your contract")).toHaveValue("Tile $9,000");

  await page.getByLabel("What are you renovating?").fill("Kitchen remodel and the primary bath");
  await page.getByLabel("Construction start").fill("2026-11-02");
  await page.getByRole("button", { name: "Build my decision map" }).click();

  await waitForPreview(page);
  const summary = page.getByText(/decisions? \(1 already decided in your documents\)/);
  await expect(summary).toContainText("3 budget lines, 6 dates");
  await expect(page.getByText("Kohler Purist faucet and 33-inch sink")).toBeVisible();
  await expect(
    page
      .getByText("Construction contract · p.2")
      .or(page.getByText(/· Construction contract p\.2/)),
  ).toBeVisible();
  // Nothing is saved before the preview is accepted.
  await page.goto("/decisions");
  await expect(page.getByText("No decisions yet.")).toBeVisible();
  await page.goto("/plan");

  await page.getByRole("button", { name: "Save to my project" }).click();
  await page.waitForURL(/\/decisions$/);
  await expect(page.getByText(/^1 of \d+ made$/)).toBeVisible();
  await page.goto("/schedule");
  await expect(page.getByText("Nov 30").first()).toBeVisible(); // rough-in, 4 weeks after start
  await page.goto("/budget");
  await expect(page.locator("article", { hasText: "Tile allowance" })).toContainText("$9,000");
  await expect(page.locator("article", { hasText: "Cushion" })).toContainText("$28,500");
  await page.goto("/");
  await expect(page.getByText(/Your decision map is ready: \d+ decisions added/)).toBeVisible();
  await page.goto("/history");
  await expect(
    page.getByText(/Project set up: \d+ decisions, 3 budget lines, 6 dates/),
  ).toBeVisible();
});

test("setup on a project that already has things only adds", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "addonly@example.com");
  await page.waitForURL(/\/start$/);
  await page.getByRole("button", { name: "Explore a sample project" }).click();
  await page.waitForURL(/\/decisions$/);
  await expect(page.getByText("12 of 32 made", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Set up from documents" }).click();
  await page.waitForURL(/\/plan$/);
  await page.getByLabel("What are you renovating?").fill("Kitchen, primary bath and hall bath");
  await page.getByLabel("Construction start").fill("2026-09-01");
  await page.getByRole("button", { name: "Build my decision map" }).click();

  await waitForPreview(page);
  await expect(page.getByText("(yours, kept)")).toHaveCount(6);
  await expect(page.getByText(/\d+ you already have stay as they are\./)).toBeVisible();
  const adds = Number(
    (await page.locator("p", { hasText: "budget line" }).first().textContent())!.match(/\d+/)![0],
  );

  await page.getByRole("button", { name: "Save to my project" }).click();
  await page.waitForURL(/\/decisions$/);
  await expect(page.getByText(`12 of ${32 + adds} made`, { exact: true })).toBeVisible();
  await page.goto("/history");
  await expect(page.getByText(/already on the list\)/)).toBeVisible();
});

test("going back keeps the answers", async ({ page }) => {
  await startProject(page, "redo@example.com", "Drew", "Redo house");
  await page.goto("/plan");
  await page.getByLabel("What are you renovating?").fill("Hall bath refresh");
  await page.getByLabel("Construction start").fill("2026-12-01");
  await page.getByRole("button", { name: "Build my decision map" }).click();
  await waitForPreview(page);
  await page.getByRole("button", { name: "Change my answers" }).click();
  await expect(page.getByLabel("What are you renovating?")).toHaveValue("Hall bath refresh");
  await expect(page.getByLabel("Construction start")).toHaveValue("2026-12-01");
});
