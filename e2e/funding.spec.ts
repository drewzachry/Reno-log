import { expect, test } from "@playwright/test";
import { invite, join, newPhone, signIn } from "./helpers";

test("accounts for the project and the buffer", async ({ browser }) => {
  const page = await newPhone(browser);
  await page.goto("/login");
  await signIn(page, "funding@example.com");
  await page.waitForURL(/\/start$/);
  await page.getByRole("button", { name: "Explore a sample project" }).click();
  await page.waitForURL(/\/decisions$/);

  // The sample: $290,000 set aside − $273,050 still to pay = $16,950 buffer.
  await page.goto("/budget");
  const funding = page.getByRole("region", { name: "Money for the project" });
  await expect(funding.getByRole("listitem")).toHaveText([
    /Savings\s*\$90,000/,
    /Home equity line of credit\s*\$200,000/,
  ]);
  const overview = page.locator("main div.bg-header");
  await expect(overview).toContainText("Total available$290,000");
  await expect(overview).toContainText("Total still to pay$273,050");
  await expect(overview).toContainText("Buffer (surplus)+$16,950");

  // Add an account.
  await funding.getByRole("button", { name: "+ Add an account" }).click();
  await funding.getByLabel("Account").fill("Gift from parents");
  await funding.getByLabel("Amount").fill("25,000");
  await funding.getByRole("button", { name: "Add account" }).click();
  await expect(overview).toContainText("Buffer (surplus)+$41,950");

  // Lower the line of credit until the money falls short.
  await funding.getByRole("button", { name: "Edit Home equity line of credit" }).click();
  await funding.getByLabel("Amount").fill("150000");
  await funding.getByRole("button", { name: "Save", exact: true }).click();
  await expect(overview).toContainText("Shortfall−$8,050");

  // Up next says so on the Chat tab.
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Up next" }).getByRole("listitem").first(),
  ).toContainText("NowMoney set aside is $8,050 short of what's still to pay");

  // Remove the gift; history keeps all three changes.
  await page.goto("/budget");
  page.once("dialog", (d) => d.accept());
  await funding.getByRole("button", { name: "Edit Gift from parents" }).click();
  await funding.getByRole("button", { name: "Remove" }).click();
  await expect(funding.getByRole("listitem")).toHaveCount(2);
  await page.goto("/history");
  const entries = page.locator("main li");
  await expect(entries.nth(0)).toContainText("Removed Gift from parents ($25,000)");
  await expect(entries.nth(1)).toContainText(
    "Home equity line of credit changed from $200,000 to $150,000",
  );
  await expect(entries.nth(2)).toContainText("Added Gift from parents: $25,000 for the project");

  // A Viewer sees the accounts and buffer but can't change them.
  const link = await invite(page, "fundviewer@example.com", "Viewer");
  const viewer = await newPhone(browser);
  await join(viewer, link, "fundviewer@example.com", "Vi");
  await expect(viewer.getByRole("banner")).toContainText("(sample)");
  await viewer.goto("/budget");
  await expect(viewer.locator("main div.bg-header")).toContainText("Shortfall−$33,050");
  const vf = viewer.getByRole("region", { name: "Money for the project" });
  await expect(vf.getByRole("button")).toHaveCount(0);
});
