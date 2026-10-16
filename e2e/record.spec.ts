import { expect, test, type Page } from "@playwright/test";
import { invite, join, newPhone, signIn } from "./helpers";

// Phase 2 acceptance (docs/BUILD_PLAN.md): every number and date in the sample
// project matches docs/SAMPLE_PROJECT.md; changing the rough-in date moves 13
// deadlines and History shows one event with before and after.

async function openSample(page: Page, email: string) {
  await page.goto("/login");
  await signIn(page, email);
  await page.waitForURL(/\/start$/);
  await page.getByRole("button", { name: "Explore a sample project" }).click();
  await page.waitForURL(/\/decisions$/);
  await expect(page.getByRole("banner")).toContainText("Rivera renovation (sample)");
}

const groupCount = (page: Page, name: string) =>
  page.locator("h2", { hasText: name }).locator("span").last();

test("the sample project's numbers, and moving rough-in", async ({ page }) => {
  await openSample(page, "sample@example.com");

  // Decisions
  await expect(page.getByText("12 of 32 made", { exact: true })).toBeVisible();
  await expect(groupCount(page, "Overdue")).toHaveText("3");
  await expect(groupCount(page, "Next 3 weeks")).toHaveText("6");
  await expect(groupCount(page, "Later")).toHaveText("11");
  await expect(groupCount(page, "Made")).toHaveText("12");
  await page.getByRole("link", { name: "By stage" }).click();
  await expect(groupCount(page, "Before rough-in")).toHaveText("9 open of 13");

  // Up next on the Chat tab
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Chat" }).click();
  const upNext = page.getByRole("region", { name: "Up next" }).getByRole("listitem");
  await expect(upNext.nth(0)).toContainText("NowTile allowance is $1,250 over budget");
  await expect(upNext.nth(1)).toContainText(
    "18 days lateDecide: Tub (freestanding or alcove) (Primary bath)",
  );

  // Budget
  await page.goto("/budget");
  await expect(page.getByText("$349,000")).toBeVisible();
  await expect(page.getByText("$77,200")).toBeVisible();
  await expect(page.getByText("$26,100", { exact: true }).first()).toBeVisible();
  const tile = page.locator("article", { hasText: "Tile allowance" });
  await expect(tile).toContainText("$9,250 of $8,000");
  await expect(tile).toContainText("Over by $1,250");
  await expect(page.locator("article", { hasText: "Plumbing fixtures allowance" })).toContainText(
    "$2,610 left",
  );
  await expect(page.locator("li", { hasText: "Add blocking for a floating vanity" })).toContainText(
    "Not approved yet",
  );

  // Move rough-in two weeks later
  await page.goto("/schedule");
  const rough = page.locator("main ol > li").first(); // milestones in order; rough-in is first
  await expect(rough).toContainText("Rough-in");
  await expect(rough).toContainText("in 24 days");
  await expect(rough).toContainText("9 open");
  await rough.getByRole("button", { name: "Change date" }).click();
  const field = rough.getByLabel("New date for rough-in");
  const current = await field.inputValue();
  const later = new Date(`${current}T00:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 14);
  await field.fill(later.toISOString().slice(0, 10));
  await rough.getByPlaceholder(/Why it moved/).fill("Plumber is two weeks behind");
  await rough.getByRole("button", { name: "Save date" }).click();
  await expect(rough.getByRole("status")).toContainText(
    "That moves 13 deadlines later. 9 still need deciding:",
  );
  await expect(rough).toContainText("in 38 days");

  // Two of the three overdue items now have time; the tub (6-week lead) is still 4 days late.
  await page.goto("/decisions");
  await expect(groupCount(page, "Overdue")).toHaveText("1");
  await expect(page.locator("article", { hasText: "Tub (freestanding or alcove)" })).toContainText(
    "4 days late",
  );
  await expect(page.locator("article", { hasText: "Range hood type and CFM" })).toContainText(
    "in 10 days",
  );

  // History: exactly one new event, with before and after and the reason.
  await page.goto("/history");
  const entries = page.locator("main li");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText(
    /Rough-in moved from \w{3} \d+, \d{4} to \w{3} \d+, \d{4} \(13 deadlines moved\)/,
  );
  await expect(entries.nth(0)).toContainText(/Was: \w{3} \d+ · Now: \w{3} \d+/);
  await expect(entries.nth(0)).toContainText("Why: Plumber is two weeks behind");
  await expect(entries.nth(1)).toContainText("Loaded the sample project");
});

test("changing a decision is logged, and a Viewer can't change anything", async ({ browser }) => {
  const owner = await newPhone(browser);
  await openSample(owner, "owner2@example.com");

  await owner.getByLabel("Status for Range hood type and CFM (Kitchen)").selectOption("decided");
  await expect(owner.locator("h2", { hasText: "Overdue" }).locator("span").last()).toHaveText("2");

  await owner.goto("/decisions");
  await owner.getByRole("link", { name: "Bathroom floor tile" }).click();
  await owner.getByLabel("What you picked").fill("Basketweave marble");
  await owner.getByLabel("Cost").fill("4,200");
  await owner.getByLabel("Why (optional)").fill("Kate preferred it");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByRole("status")).toContainText("Saved");
  const history = owner.locator("section", { hasText: "History" }).locator("li").first();
  await expect(history).toContainText(
    "Bathroom floor tile (Primary bath): picked Basketweave marble",
  );
  await expect(history).toContainText(
    "Was: Hex Carrara marble mosaic, $3,900 · Now: Basketweave marble, $4,200",
  );
  await expect(history).toContainText("Why: Kate preferred it");

  // The allowance now counts the new price: $9,550 chosen, $1,550 over.
  await owner.goto("/budget");
  await expect(owner.locator("article", { hasText: "Tile allowance" })).toContainText(
    "Over by $1,550",
  );

  // A Viewer sees the record but no controls.
  const link = await invite(owner, "viewer2@example.com", "Viewer");
  const viewer = await newPhone(browser);
  await join(viewer, link, "viewer2@example.com", "Vee");
  await expect(viewer.getByRole("banner")).toContainText("Rivera renovation (sample)");
  await viewer.goto("/decisions");
  await expect(viewer.getByText("13 of 32 made", { exact: true })).toBeVisible(); // the owner decided the hood
  await expect(viewer.getByRole("combobox")).toHaveCount(0);
  await viewer.goto("/schedule");
  await expect(viewer.getByRole("button", { name: /Change date|Set date/ })).toHaveCount(0);
  await viewer.goto("/decisions");
  await viewer.getByRole("link", { name: "Edge profile" }).click();
  await expect(viewer.getByRole("button", { name: "Save" })).toHaveCount(0);
});
