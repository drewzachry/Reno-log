import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { invite, join, newPhone, signIn } from "./helpers";

// Phase 3 acceptance (docs/BUILD_PLAN.md), against the scripted Claude in
// e2e/stack/fake-claude.mjs: what matters here is that the app briefs it,
// turns its proposals into cards, and changes nothing until "Log it".

test.describe.configure({ timeout: 90_000 });
const SLOW = { timeout: 20_000 };

async function openSample(page: Page, email: string) {
  await page.goto("/login");
  await signIn(page, email);
  await page.waitForURL(/\/start$/);
  await page.getByRole("button", { name: "Explore a sample project" }).click();
  await page.waitForURL(/\/decisions$/);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Chat" }).click();
  await expect(page.getByLabel("Message")).toBeVisible();
}

async function say(page: Page, text: string) {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

const card = (page: Page, kind: string) =>
  page
    .getByRole("article")
    .filter({ has: page.getByText(kind, { exact: true }) })
    .last();

async function photo(color: string) {
  return {
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await sharp({ create: { width: 64, height: 48, channels: 3, background: color } })
      .jpeg()
      .toBuffer(),
  };
}

test("'GC says drywall moved to Nov 23' proposes a schedule card that moves deadlines", async ({
  page,
}) => {
  await openSample(page, "drywall@example.com");
  await expect(page.getByText(/Hi! I keep your renovation organized/)).toBeVisible();
  await say(page, "GC says drywall moved to Nov 23");

  const c = card(page, "Schedule change");
  await expect(c).toContainText(/Walls close: \w+ \d+ → Nov 23/, SLOW);
  await expect(c).toContainText(/Moves \d+ deadlines/);
  // Nothing changes until it's confirmed.
  await page.goto("/schedule");
  await expect(page.getByText("Nov 23")).toHaveCount(0);
  await page.goto("/");

  await card(page, "Schedule change").getByRole("button", { name: "Log it" }).click();
  await expect(card(page, "Schedule change")).toContainText("✓ Logged", SLOW);
  await expect(page.getByText(/That moves \d+ deadlines (earlier|later)\./)).toBeVisible(SLOW);
  await page.goto("/schedule");
  await expect(page.getByText("Nov 23").first()).toBeVisible();
  await page.goto("/history");
  await expect(page.getByText(/Walls close/).first()).toBeVisible();
});

test("a photo of an invoice proposes an invoice card; the original is kept", async ({ page }) => {
  await openSample(page, "invoice@example.com");
  await page.getByLabel("Add photos").setInputFiles(await photo("#ffffff"));
  await expect(page.getByRole("list", { name: "Files to send" }).locator("img")).toHaveCount(1);
  await say(page, "Here's the plumber's invoice");

  const c = card(page, "Invoice");
  await expect(c).toContainText("Rivera Plumbing · $2,400", SLOW);
  await expect(c).toContainText("Plumbing fixtures allowance");
  await expect(page.getByRole("img", { name: "Attached photo" })).toBeVisible();
  const sent = await (await fetch("http://localhost:54321/v1/test/last-request")).json();
  const last = sent.messages.at(-1).content;
  expect(last.filter((b: { type: string }) => b.type === "image")).toHaveLength(1);

  await c.getByRole("button", { name: "Log it" }).click();
  await expect(card(page, "Invoice")).toContainText("✓ Logged", SLOW);
  await expect(page.getByText("Plumbing fixtures allowance: $2,610 left of $9,500.")).toBeVisible(
    SLOW,
  );
  await page.goto("/budget");
  await expect(page.getByText("Rivera Plumbing").first()).toBeVisible();
});

test("a photo of a tile sample proposes a decision update", async ({ page }) => {
  await openSample(page, "tile@example.com");
  await page.getByLabel("Add photos").setInputFiles(await photo("#d8d2c4"));
  await say(page, "Picked this tile sample for the primary shower");

  const c = card(page, "Decision");
  await expect(c).toContainText("Shower wall tile (Primary bath)", SLOW);
  await expect(c).toContainText("Exploring → Decided · White zellige 2x6 · $4,100");
  await expect(c).toContainText("Tile allowance would be $5,350 over (now $1,250)");

  await page.getByRole("button", { name: "Not now" }).click();
  await expect(card(page, "Decision")).toContainText("Skipped", SLOW);
  await page.goto("/decisions");
  await expect(page.getByText("White zellige 2x6")).toHaveCount(0);
});

test("'We want brushed nickel everywhere' is remembered and used later", async ({ page }) => {
  await openSample(page, "nickel@example.com");
  await say(page, "We want brushed nickel everywhere");
  const c = card(page, "Remember");
  await expect(c).toContainText("Wants brushed nickel fixtures everywhere", SLOW);
  await c.getByRole("button", { name: "Log it" }).click();
  await expect(card(page, "Remember")).toContainText("✓ Logged", SLOW);

  await say(page, "What finish should the towel bars be?");
  await expect(
    page.getByText("Go with brushed nickel, to match the rest of the house."),
  ).toBeVisible(SLOW);

  await page.goto("/settings");
  const facts = page.getByRole("region", { name: "What the app remembers" });
  await expect(facts).toContainText("Wants brushed nickel fixtures everywhere");
  await facts.getByRole("button", { name: /^Forget/ }).click();
  await expect(facts).toContainText("Nothing yet");
});

test("a Viewer can ask questions but sees no Log it buttons", async ({ page, browser }) => {
  await openSample(page, "owner3@example.com");
  await say(page, "We want brushed nickel everywhere");
  await expect(card(page, "Remember")).toContainText("Log it", SLOW);
  const link = await invite(page, "viewer3@example.com", "Viewer");

  const viewer = await newPhone(browser);
  await join(viewer, link, "viewer3@example.com", "Val");
  await expect(viewer.getByRole("banner")).toContainText("(sample)");
  await viewer.goto("/");
  await expect(card(viewer, "Remember")).toContainText("Waiting for an editor to log it");
  await expect(viewer.getByRole("button", { name: "Log it" })).toHaveCount(0);
  await expect(viewer.getByText("Add photos")).toHaveCount(0);

  await say(viewer, "What finish should the faucet be?");
  await expect(viewer.getByText("Any finish works; pick one and use it throughout.")).toBeVisible(
    SLOW,
  );
  // The owner sees the viewer's question, with their name.
  await page.goto("/");
  await expect(page.getByText("What finish should the faucet be?")).toBeVisible();
  await expect(page.getByText("Val", { exact: true })).toBeVisible();
});
