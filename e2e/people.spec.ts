import { expect, test } from "@playwright/test";
import { invite, join, newPhone, startProject } from "./helpers";

// Phase 1 acceptance (docs/BUILD_PLAN.md): Drew creates a project, invites a
// second email as Editor, that person accepts on a phone and sees the project;
// a Viewer cannot edit; removing someone cuts access immediately.

test("invite, accept, roles and removal", async ({ browser }) => {
  const drew = await newPhone(browser);
  await startProject(drew, "drew@example.com", "Drew", "Rivera renovation");

  const kateLink = await invite(drew, "kate@example.com", "Editor");
  const valLink = await invite(drew, "val@example.com", "Viewer");
  await drew.reload();
  const waiting = drew.locator("li", { hasText: /link works until/ });
  await expect(waiting).toHaveCount(2);
  await expect(waiting.first()).toContainText("val@example.com");

  // Kate sees who invited her before signing in, then joins.
  const kate = await newPhone(browser);
  await kate.goto(kateLink);
  await expect(kate.getByRole("heading")).toHaveText("Drew invited you to Rivera renovation");
  await join(kate, kateLink, "kate@example.com", "Kate");
  await expect(kate.getByRole("banner")).toContainText("Rivera renovation");

  // Someone else can't use Val's link.
  const sam = await newPhone(browser);
  await join(sam, valLink, "sam@example.com", "Sam");
  await expect(sam.locator("main").getByRole("alert")).toHaveText(
    "This invite was sent to v***@example.com. Sign in with that email, or ask Drew to invite this address.",
  );

  // Val joins as a Viewer and gets no editing controls.
  const val = await newPhone(browser);
  await join(val, valLink, "val@example.com", "Val");
  await expect(val.getByRole("banner")).toContainText("Rivera renovation");
  await val.goto("/settings");
  await expect(val.getByText(/You.re a Viewer/)).toBeVisible();
  await expect(val.getByLabel("Their email")).toHaveCount(0);
  await expect(val.getByRole("combobox")).toHaveCount(0);

  // Only the owner manages people: Kate (Editor) can invite but not change roles.
  await kate.goto("/settings");
  await expect(kate.getByLabel("Their email")).toBeVisible();
  await expect(kate.getByRole("combobox")).toHaveCount(0);

  // Drew changes Kate to Viewer, then removes Val.
  await drew.goto("/settings");
  await drew.getByLabel("Role for Kate").selectOption("viewer");
  await expect(drew.getByLabel("Role for Kate")).toHaveValue("viewer");
  drew.once("dialog", (d) => d.accept());
  await drew
    .locator("li", { hasText: "val@example.com" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(drew.locator("li", { hasText: "val@example.com" })).toHaveCount(0);

  // Val loses access on the next page load.
  await val.goto("/");
  await expect(val).toHaveURL(/\/start$/);

  // History records every change with who did it, names intact after removal.
  await drew.goto("/history");
  const entries = drew.locator("main li");
  await expect(entries.nth(0)).toContainText("Removed Val");
  await expect(entries.nth(1)).toContainText("Kate is now Viewer");
  await expect(entries.filter({ hasText: "Val joined as Viewer" })).toContainText("Val");
  await expect(entries.last()).toContainText('Started the project "Rivera renovation"');
});

test("a wrong code is refused and signed-out visitors go to sign in", async ({ page }) => {
  await page.goto("/budget");
  await expect(page).toHaveURL(/\/login\?next=%2Fbudget$/);
  await page.getByLabel("Your email").fill("new@example.com");
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.getByLabel("Code from the email").fill("12");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("all numbers");
  await page.getByLabel("Code from the email").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Signing in returns to /budget, which sends someone with no project to start one.
  await expect(page).toHaveURL(/\/start$/);
});

test("a broken invite link says so plainly", async ({ page }) => {
  await page.goto("/invite/not-a-real-token");
  await expect(page.getByRole("heading")).toHaveText(/This link doesn.t work/);
});
