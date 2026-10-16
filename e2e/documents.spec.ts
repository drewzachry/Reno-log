import { expect, test, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { signIn } from "./helpers";

// Phase 4 acceptance (docs/BUILD_PLAN.md), with the scripted Claude in
// e2e/stack/fake-claude.mjs reading the real text of the files: documents are
// read in the background, show a summary and key facts with pages, and the
// chat answers from them with the page.

test.describe.configure({ timeout: 120_000 });
const READ = { timeout: 45_000 };

async function pdf(pages: string[][]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    lines.forEach((l, i) => page.drawText(l, { x: 50, y: 740 - i * 20, size: 12, font }));
  }
  return Buffer.from(await doc.save());
}

const contract = () =>
  pdf([
    [
      "Construction contract between the Riveras and Oak & Sons Builders.",
      "Contract price: $285,000.",
    ],
    ["Owner to select: Garage door opener (Garage).", "Payments are due monthly."],
    ["Exclusions: painting, landscaping and appliances are excluded from this contract."],
  ]);

/** A minimal Word file. */
function docx(text: string) {
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      "word/document.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    }),
  );
}

async function openSample(page: Page, email: string) {
  await page.goto("/login");
  await signIn(page, email);
  await page.waitForURL(/\/start$/);
  await page.getByRole("button", { name: "Explore a sample project" }).click();
  await page.waitForURL(/\/decisions$/);
}

async function addDocuments(
  page: Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  await page.goto("/documents");
  await page.getByLabel("Add documents").setInputFiles(files);
}

const docCard = (page: Page, title: string) => page.getByRole("link").filter({ hasText: title });

test("a contract PDF is read; the chat answers from it with the page", async ({ page }) => {
  await openSample(page, "docs1@example.com");
  await addDocuments(page, [
    { name: "Oak-Sons contract.pdf", mimeType: "application/pdf", buffer: await contract() },
  ]);

  const card = docCard(page, "Construction contract");
  await expect(card).toContainText("Contract", READ);
  await expect(card).toContainText("Your agreement with the builder");
  await expect(card).toContainText("3 pages");

  await card.click();
  await expect(page.getByRole("heading", { name: "Construction contract" })).toBeVisible();
  await expect(page.getByText("$285,000", { exact: true })).toBeVisible();
  const says = page.getByRole("region", { name: "What it says" });
  await expect(says).toContainText("Exclusions: painting, landscaping and appliances");
  await expect(says.getByRole("link", { name: "p.3" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the original" })).toBeVisible();

  // The chat says it's read, and offers the decision the contract names.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Chat" }).click();
  await expect(page.getByText(/I read “Construction contract”/)).toBeVisible();
  const offer = page.getByRole("article").filter({ hasText: "New decision" });
  await expect(offer).toContainText("Garage door opener (Garage)");
  await expect(page.getByText(/and it isn’t there yet\. Want me to add it\?/)).toBeVisible();

  await page.getByLabel("Message").fill("What's excluded from my contract?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText(
      "Exclusions: painting, landscaping and appliances are excluded from this contract. (Construction contract, p.3)",
    ),
  ).toBeVisible(READ);

  await page.goto("/history");
  await expect(page.getByText("Document added: Construction contract")).toBeVisible();
});

test("a ZIP becomes one document per file inside, Word files included", async ({ page }) => {
  await openSample(page, "docs2@example.com");
  const zip = Buffer.from(
    zipSync({
      "Permit set/A-101 Floor plan.pdf": new Uint8Array(
        await pdf([["Sheet A-101 floor plan.", "Primary shower: 42 by 60 inches."]]),
      ),
      "Permit set/Specs.docx": new Uint8Array(
        docx("Tile: Daltile 12x24 porcelain in the hall bath."),
      ),
      "__MACOSX/Permit set/._A-101 Floor plan.pdf": strToU8("junk"),
    }),
  );
  await addDocuments(page, [{ name: "Permit set.zip", mimeType: "application/zip", buffer: zip }]);
  await expect(docCard(page, "A-101 Floor plan")).toContainText("Plans", READ);
  await expect(docCard(page, "Specs")).toContainText("1 page", READ);
  await expect(page.getByRole("link").filter({ hasText: "Permit set" })).toHaveCount(0);

  await docCard(page, "Specs").click();
  await expect(page.getByRole("region", { name: "What it says" })).toContainText(
    "Tile: Daltile 12x24 porcelain",
  );
});

test("a PDF dropped in the chat is read, and the chat says so", async ({ page }) => {
  await openSample(page, "docs3@example.com");
  await page.goto("/");
  await page.getByLabel("Add photos").setInputFiles({
    name: "contract.pdf",
    mimeType: "application/pdf",
    buffer: await contract(),
  });
  await expect(page.getByRole("list", { name: "Files to send" })).toContainText("contract.pdf");
  await page.getByLabel("Message").fill("Here's our contract");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I'm reading that now")).toBeVisible(READ);
  await expect(page.getByRole("link", { name: "📄 contract.pdf" })).toBeVisible();
  // On Supabase, Realtime brings the reply in; the test stack has no Realtime, so reload.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/I read “Construction contract”/)).toBeVisible({ timeout: 2000 });
  }).toPass(READ);
});

test("a file that can't be read says why, and can be removed", async ({ page }) => {
  await openSample(page, "docs4@example.com");
  await addDocuments(page, [
    { name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("not really a pdf") },
  ]);
  const card = docCard(page, "broken");
  await expect(card).toContainText("Couldn’t read", READ);
  await expect(card).toContainText("That PDF couldn't be opened");
  await card.click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove" }).click();
  await page.waitForURL(/\/documents$/);
  await expect(docCard(page, "broken")).toHaveCount(0);
  await page.goto("/history");
  await expect(page.getByText("Document removed: broken")).toBeVisible();
});
