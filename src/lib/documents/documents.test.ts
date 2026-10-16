// @vitest-environment node
import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fileType, pdfPages, pdfText, ReadError, splitText, titleFromName, unzip } from "./extract";
import { batchResult, finishResult, parseJson } from "./schemas";

async function pdf(n: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++)
    doc.addPage([300, 300]).drawText(`Sheet ${i}`, { x: 20, y: 150, font });
  return doc.save();
}

describe("files", () => {
  it("knows what it can read", () => {
    expect(fileType("application/pdf", "x")).toBe("pdf");
    expect(fileType("", "Plans.PDF")).toBe("pdf");
    expect(fileType("", "specs.docx")).toBe("docx");
    expect(fileType("image/jpeg", "IMG_1.jpg")).toBe("image");
    expect(fileType("", "notes.txt")).toBe("text");
    expect(fileType("application/zip", "set.zip")).toBe("zip");
    expect(fileType("application/octet-stream", "model.dwg")).toBeNull();
  });

  it("makes a readable title from a file name", () => {
    expect(titleFromName("Permit set/A-101_Floor_plan.pdf")).toBe("A-101 Floor plan");
    expect(titleFromName(".pdf")).toBe("Document");
  });

  it("splits long text at paragraph breaks", () => {
    const text = `${"a".repeat(60)}\n\n${"b".repeat(60)}\n\n${"c".repeat(30)}`;
    expect(splitText(text, 100)).toEqual([
      "a".repeat(60),
      `${"b".repeat(60)}\n\n${"c".repeat(30)}`,
    ]);
    expect(splitText("x".repeat(250), 100).map((s) => s.length)).toEqual([100, 100, 50]);
  });
});

describe("PDFs", () => {
  it("reads the text of every page", async () => {
    const r = await pdfText(await pdf(3));
    expect(r.pageCount).toBe(3);
    expect(r.pages).toEqual(["Sheet 1", "Sheet 2", "Sheet 3"]);
  });

  it("cuts a batch of pages out of a big set", async () => {
    const big = await pdf(45);
    const part = await pdfPages(big, 21, 40);
    const r = await pdfText(part);
    expect(r.pageCount).toBe(20);
    expect(r.pages[0]).toBe("Sheet 21");
    expect(r.pages[19]).toBe("Sheet 40");
  });

  it("explains a damaged PDF in plain words", async () => {
    await expect(pdfText(new TextEncoder().encode("nope"))).rejects.toThrow(ReadError);
  });
});

describe("ZIPs", () => {
  it("keeps documents and skips Mac metadata, folders and other files", () => {
    const zip = zipSync({
      "set/A-102.pdf": strToU8("%PDF b"),
      "set/A-101.pdf": strToU8("%PDF a"),
      "set/specs.docx": strToU8("doc"),
      "__MACOSX/set/._A-101.pdf": strToU8("junk"),
      "set/.DS_Store": strToU8("junk"),
      "set/model.dwg": strToU8("cad"),
      "set/inner.zip": strToU8("zip"),
    });
    expect(unzip(zip).map((e) => e.name)).toEqual([
      "set/A-101.pdf",
      "set/A-102.pdf",
      "set/specs.docx",
    ]);
  });
});

describe("checking what the reader returns", () => {
  it("accepts a well-formed batch and rejects junk", () => {
    expect(
      parseJson(
        batchResult,
        JSON.stringify({
          pages: [{ page: 3, description: "Floor plan" }],
          facts: [{ topic: "Rooms", detail: "Primary shower 42 x 60 in", page: 3 }],
        }),
      ),
    ).toMatchObject({ facts: [{ page: 3 }] });
    expect(parseJson(batchResult, "not json")).toBeNull();
    expect(parseJson(batchResult, JSON.stringify({ pages: "x", facts: [] }))).toBeNull();
  });

  it("tidies an unknown topic and drops a bad date instead of failing", () => {
    const r = parseJson(
      finishResult,
      JSON.stringify({
        kind: "brochure",
        title: "Contract",
        summary: "The agreement.",
        facts: [{ topic: "Gossip", detail: "x", page: null }],
        contract_price_cents: 28500000,
        allowances: [],
        start_date: "next spring",
        completion_date: "2027-03-01",
        decisions_named: 0,
        new_decisions: [],
      }),
    );
    expect(r).toMatchObject({
      kind: "other",
      facts: [{ topic: "Other" }],
      start_date: null,
      completion_date: "2027-03-01",
    });
  });
});
