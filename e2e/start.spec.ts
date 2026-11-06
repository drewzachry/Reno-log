import { expect, test } from "@playwright/test";
import {
  fakeDriveProjectFolders,
  installGoogleFakes,
  setFakePickerResult,
  signInAsGoogleUser,
} from "./stack/google";
import { startProject } from "./helpers";

// Phase 1 acceptance (sign-in + Drive bootstrap + Picker reopen, no Supabase
// involved): a second person opens the project someone else created, via
// the Picker, without creating their own.

test("a second person opens an existing project via the Picker", async ({ page, browser }) => {
  await startProject(page, "drew@example.com", "Drew", "Maple Street renovation");

  const folder = fakeDriveProjectFolders().find((f) => f.name === "Maple Street renovation — Reno");
  expect(folder).toBeTruthy();

  const spouse = await browser.newContext();
  const spousePage = await spouse.newPage();
  await installGoogleFakes(spousePage);
  await spousePage.goto("/login");
  await signInAsGoogleUser(spousePage, "kate@example.com", "Kate");
  await spousePage.waitForURL(/\/start$/);

  await setFakePickerResult(spousePage, { id: folder!.id, name: folder!.name });
  await spousePage.getByRole("button", { name: "Open an existing project" }).click();
  await spousePage.waitForURL("/");
  await expect(spousePage.getByRole("banner")).toContainText("Maple Street renovation");
});

test("the Picker being cancelled leaves the person on /start", async ({ page }) => {
  await installGoogleFakes(page); // before the first navigation — see helpers.ts's startProject
  await page.goto("/login");
  await signInAsGoogleUser(page, "cancels@example.com", "Cancels");
  await page.waitForURL(/\/start$/);

  await setFakePickerResult(page, null); // null = the fake Picker reports "cancelled"
  await page.getByRole("button", { name: "Open an existing project" }).click();
  await page.waitForTimeout(300); // the picker callback fires on a timer; give it a beat
  await expect(page).toHaveURL(/\/start$/);
});
