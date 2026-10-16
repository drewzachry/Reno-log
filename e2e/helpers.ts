import { expect, type Browser, type Page } from "@playwright/test";

/** A fresh phone with its own cookies, like a second person's device. */
export async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  return context.newPage();
}

/** Signs in on the login page with the email code (the test stack accepts any 6 digits). */
export async function signIn(page: Page, email: string) {
  await requestLink(page, email);
  await page.getByText("Got a code instead of a link?").click();
  await page.getByLabel("Code from the email").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function requestLink(page: Page, email: string) {
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

/** The sign-in link the test stack "emailed" most recently to this address. */
export async function lastEmailedLink(email: string): Promise<string> {
  const res = await fetch(
    `http://localhost:54321/auth/v1/test/last-link?email=${encodeURIComponent(email)}`,
  );
  return ((await res.json()) as { link: string }).link;
}

/** Signs a new person in and starts a project; leaves them on the Chat tab. */
export async function startProject(page: Page, email: string, name: string, project: string) {
  await page.goto("/");
  await signIn(page, email);
  await page.waitForURL(/\/start$/);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Project name").fill(project);
  await page.getByRole("button", { name: "Start the project" }).click();
  await expect(page.getByRole("banner")).toContainText(project);
}

/** Invites someone from Project settings and returns the invite link. */
export async function invite(page: Page, email: string, role: "Editor" | "Viewer") {
  await page.goto("/settings");
  await page.getByLabel("Their email").fill(email);
  await page.getByLabel(new RegExp(role)).check();
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const status = page.getByRole("status").filter({ hasText: email });
  return (await status.locator("code").textContent())!.trim();
}

/** Opens an invite link signed out, signs in and joins. */
export async function join(page: Page, link: string, email: string, name: string) {
  await page.goto(link);
  await page.getByRole("link", { name: "Sign in to join" }).click();
  await signIn(page, email);
  await page.waitForURL(/\/invite\//);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join the project" }).click();
}
