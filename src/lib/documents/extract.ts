import { unzipSync } from "fflate";
import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";

export type FileType = "pdf" | "docx" | "image" | "text" | "zip";

/** What the reader can do with a file, from its type or, failing that, its name. */
export function fileType(mime: string, name: string): FileType | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.includes("wordprocessingml") || ext === "docx") return "docx";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "gif"].includes(ext))
    return "image";
  if (mime.startsWith("text/") || ["txt", "csv", "md"].includes(ext)) return "text";
  if (mime.includes("zip") || ext === "zip") return "zip";
  return null;
}

/** "A-101_Floor-plan.pdf" → "A-101 Floor plan". */
export function titleFromName(name: string): string {
  const base = (name.split("/").pop() ?? name).replace(/\.[a-z0-9]{1,5}$/i, "");
  return base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "Document";
}

export class ReadError extends Error {}

/** Page count and the text on each page. */
export async function pdfText(bytes: Uint8Array) {
  try {
    const pdf = await getDocumentProxy(bytes.slice());
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return { pageCount: totalPages, pages: text.map((t) => t.replace(/\s+/g, " ").trim()) };
  } catch (e) {
    if (e instanceof Error && /password/i.test(e.message))
      throw new ReadError(
        "That PDF is password-protected. Save an unlocked copy and add it again.",
      );
    throw new ReadError("That PDF couldn't be opened. It may be damaged; try saving it again.");
  }
}

/** Pages from (1-based, inclusive) to as a PDF of their own. */
export async function pdfPages(bytes: Uint8Array, from: number, to: number) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  const idx = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  for (const p of await out.copyPages(src, idx)) out.addPage(p);
  return out.save();
}

export async function docxText(bytes: Uint8Array) {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

/** Splits text into pieces of about size characters, at paragraph or line breaks where possible. */
export function splitText(text: string, size: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > size) {
    const window = rest.slice(0, size);
    let cut = window.lastIndexOf("\n\n");
    if (cut < size / 2) cut = window.lastIndexOf("\n");
    if (cut < size / 2) cut = window.lastIndexOf(". ") + 1;
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Documents inside a ZIP (PDFs, Word files, images, text), skipping Mac metadata and folders. */
export function unzip(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ReadError("That ZIP file couldn't be opened. Try downloading it again.");
  }
  return Object.entries(files)
    .filter(([name, data]) => {
      const base = name.split("/").pop() ?? "";
      return (
        data.length > 0 &&
        !name.startsWith("__MACOSX/") &&
        !base.startsWith(".") &&
        fileType("", base) != null &&
        fileType("", base) !== "zip"
      );
    })
    .map(([name, data]) => ({ name, data }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
}

export const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
};
export const mimeFor = (name: string) =>
  MIME[name.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";
