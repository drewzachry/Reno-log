import { expect, test } from "@playwright/test";
import { lastEmailedLink, newPhone, requestLink } from "./helpers";

test("the email link signs you in when opened in the same browser", async ({ page }) => {
  await page.goto("/login");
  await requestLink(page, "samebrowser@example.com");
  await page.goto(await lastEmailedLink("samebrowser@example.com"));
  await expect(page).toHaveURL(/\/start$/);
});

// On iPhone the home-screen app and Safari keep separate cookies. The app asks
// for the link; the link opens in Safari; the app should still end up signed in.
test("the email link opened in Safari signs in the waiting home-screen app", async ({
  browser,
}) => {
  const app = await newPhone(browser);
  await app.goto("/login?next=%2Fsettings");
  await requestLink(app, "handoff@example.com");

  const safari = await newPhone(browser);
  await safari.goto(await lastEmailedLink("handoff@example.com"));
  await expect(safari.getByRole("heading", { name: /You.re signed in/ })).toBeVisible();
  await expect(safari.getByText("Go back to the Reno Logbook app")).toBeVisible();

  // The app notices by itself and continues to where it was going (a new
  // person has no project yet, so /settings sends them to start one).
  await expect(app).toHaveURL(/\/start$/, { timeout: 10_000 });

  // Safari didn't get signed in, and the link can't be used twice.
  await safari.goto("/");
  await expect(safari).toHaveURL(/\/login/);
});

test("an old link that was already used says so", async ({ page }) => {
  await page.goto("/login");
  await requestLink(page, "reuse@example.com");
  const link = await lastEmailedLink("reuse@example.com");
  await page.goto(link);
  await expect(page).toHaveURL(/\/start$/);
  const other = await newPhone(page.context().browser()!);
  await other.goto(link);
  await expect(other.locator("main")).toContainText(/link expired|didn.t work/i);
});
