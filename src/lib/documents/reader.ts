import "server-only";
import { randomUUID } from "node:crypto";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { z } from "zod";
import { askStructured } from "@/lib/ai/structured";
import { buildCard, type Card } from "@/lib/chat/cards";
import { todayIn } from "@/lib/record/dates";
import { loadRecord } from "@/lib/record/load";
import {
  docxText,
  fileType,
  mimeFor,
  pdfPages,
  pdfText,
  ReadError,
  splitText,
  titleFromName,
  unzip,
} from "./extract";
import { FINISH_PROMPT, READ_PROMPT } from "./prompts";
import {
  BATCH_SCHEMA,
  batchResult,
  FINISH_SCHEMA,
  finishResult,
  type Fact,
} from "./schemas";

const BUCKET = "project-files";
const BATCH_PAGES = 20;
/** Under the API's 32 MB request limit, with room for base64. */
const MAX_BATCH_BYTES = 20 * 1024 * 1024;
const SECTION_CHARS = 120_000;
const CHUNK_CHARS = 1800;
const MAX_FOLLOW_UP_CARDS = 10;

export { ReadError };

type Note = { page: number | null; description: string };
export type ReadState = { next?: number; total?: number; notes?: Note[]; facts?: Fact[] };
export type ReadJob = {
  id: string;
  attempts: number;
  payload: { document_id: string };
  state: ReadState;
};
type Doc = {
  id: string;
  project_id: string;
  title: string;
  created_by: string | null;
  deleted_at: string | null;
  file: { storage_path: string; original_name: string; mime_type: string } | null;
};

function ask<T>(
  admin: SupabaseClient,
  doc: Doc,
  system: string,
  schema: object,
  check: z.ZodType<T>,
  content: BetaContentBlockParam[],
): Promise<T> {
  return askStructured({
    admin,
    projectId: doc.project_id,
    userId: doc.created_by,
    purpose: "document",
    system,
    schema,
    check,
    content,
  });
}

const setProgress = (admin: SupabaseClient, id: string, progress: string) =>
  admin.from("documents").update({ progress, updated_at: new Date().toISOString() }).eq("id", id);

async function saveChunks(
  admin: SupabaseClient,
  doc: Doc,
  rows: { page: number | null; seq: number; text: string }[],
  replace: { seqFrom: number; seqTo: number },
) {
  await admin
    .from("document_chunks")
    .delete()
    .eq("document_id", doc.id)
    .gte("seq", replace.seqFrom)
    .lte("seq", replace.seqTo);
  const clean = rows.filter((r) => r.text.trim());
  if (clean.length) {
    const { error } = await admin
      .from("document_chunks")
      .insert(clean.map((r) => ({ document_id: doc.id, project_id: doc.project_id, ...r })));
    if (error) throw new Error(`saving pages failed: ${error.code}`);
  }
}

/** A ZIP becomes one document per file inside it, each read on its own. */
async function expandZip(admin: SupabaseClient, doc: Doc, bytes: Uint8Array) {
  const entries = unzip(bytes);
  if (!entries.length) throw new ReadError("That ZIP has no PDFs, Word files or images in it.");
  for (const e of entries) {
    const base = e.name.split("/").pop()!;
    const path = `projects/${doc.project_id}/docs/${randomUUID()}-${base.replace(/[^\w.-]+/g, "-").slice(-80)}`;
    const mime = mimeFor(base);
    const up = await admin.storage.from(BUCKET).upload(path, e.data, { contentType: mime });
    if (up.error) throw new Error(`storing ${base} failed`);
    const { data: file, error } = await admin
      .from("files")
      .insert({
        project_id: doc.project_id,
        storage_path: path,
        original_name: base.slice(0, 200),
        mime_type: mime,
        size_bytes: e.data.length,
        uploaded_by: doc.created_by,
        kind: "document",
      })
      .select("id")
      .single();
    if (error || !file) throw new Error("recording a file failed");
    const { data: child } = await admin
      .from("documents")
      .insert({
        project_id: doc.project_id,
        file_id: file.id,
        title: titleFromName(base),
        created_by: doc.created_by,
        progress: "Waiting to start",
      })
      .select("id")
      .single();
    await admin.from("jobs").insert({ type: "read_document", payload: { document_id: child!.id } });
  }
  // The ZIP itself was only a wrapper; it never appears as a document.
  await admin
    .from("documents")
    .update({ deleted_at: new Date().toISOString(), status: "ready", progress: null })
    .eq("id", doc.id);
}

const partNote = (from: number, to: number, total: number, title: string) =>
  `This file holds page${from === to ? ` ${from}` : `s ${from}-${to}`} of “${title}” (${total} page${total === 1 ? "" : "s"} in all). Its first page is page ${from} of the whole document; use whole-document page numbers.`;

/**
 * Reads one document, a part at a time, saving progress after each part so
 * the next run can carry on. Returns "more" when it ran out of time.
 */
export async function readDocument(
  admin: SupabaseClient,
  job: ReadJob,
  deadline: number,
): Promise<"done" | "more"> {
  const { data } = await admin
    .from("documents")
    .select(
      "id, project_id, title, created_by, deleted_at, file:files(storage_path, original_name, mime_type)",
    )
    .eq("id", job.payload.document_id)
    .maybeSingle();
  const doc = data as Doc | null;
  if (!doc || doc.deleted_at || !doc.file) return "done";

  const type = fileType(doc.file.mime_type, doc.file.original_name);
  if (!type)
    throw new ReadError(
      "That kind of file can't be read. Add a PDF, Word file, photo or text file.",
    );
  await setProgress(admin, doc.id, "Opening the file");
  const dl = await admin.storage.from(BUCKET).download(doc.file.storage_path);
  if (dl.error || !dl.data) throw new Error("download failed");
  const bytes = new Uint8Array(await dl.data.arrayBuffer());

  if (type === "zip") {
    await setProgress(admin, doc.id, "Unpacking the ZIP");
    await expandZip(admin, doc, bytes);
    return "done";
  }

  const state: ReadState = { notes: [], facts: [], next: 1, ...job.state };
  const save = () => admin.from("jobs").update({ state }).eq("id", job.id);

  if (type === "pdf") {
    const { pageCount, pages } = await pdfText(bytes);
    if (!pageCount) throw new ReadError("That PDF has no pages.");
    state.total = pageCount;
    while (state.next! <= pageCount) {
      if (Date.now() > deadline) {
        await save();
        return "more";
      }
      const from = state.next!;
      let to = Math.min(pageCount, from + BATCH_PAGES - 1);
      let part = await pdfPages(bytes, from, to);
      while (part.length > MAX_BATCH_BYTES && to > from) {
        to = from + Math.floor((to - from) / 2);
        part = await pdfPages(bytes, from, to);
      }
      await setProgress(
        admin,
        doc.id,
        from === to
          ? `Reading page ${from} of ${pageCount}`
          : `Reading pages ${from}–${to} of ${pageCount}`,
      );
      let notes: Note[] = [];
      if (part.length <= MAX_BATCH_BYTES) {
        const r = await ask(admin, doc, READ_PROMPT, BATCH_SCHEMA, batchResult, [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(part).toString("base64"),
            },
          },
          { type: "text", text: partNote(from, to, pageCount, doc.title) },
        ]);
        notes = r.pages
          .filter((p) => p.page >= from && p.page <= to && p.description.trim())
          .map((p) => ({ page: p.page, description: p.description.trim() }));
        state.facts!.push(...r.facts.map((f) => ({ ...f, page: f.page ?? null })));
      } else {
        notes = [
          {
            page: from,
            description: "(This page was too large to look at; only its text was kept.)",
          },
        ];
      }
      state.notes!.push(...notes);
      const rows = [];
      for (let p = from; p <= to; p++) {
        const desc = notes
          .filter((n) => n.page === p)
          .map((n) => n.description)
          .join(" ");
        const text = [pages[p - 1], desc && `[What the page shows] ${desc}`]
          .filter(Boolean)
          .join("\n");
        rows.push(
          ...splitText(text, CHUNK_CHARS).map((t, i) => ({ page: p, seq: p * 100 + i, text: t })),
        );
      }
      await saveChunks(admin, doc, rows, { seqFrom: from * 100, seqTo: to * 100 + 99 });
      state.next = to + 1;
      await save();
    }
  } else if (type === "image") {
    state.total = 1;
    if (state.next! <= 1) {
      await setProgress(admin, doc.id, "Looking at the image");
      let jpeg: Buffer;
      try {
        jpeg = await sharp(Buffer.from(bytes))
          .rotate()
          .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch {
        throw new ReadError("That image couldn't be opened. Try a JPEG or PNG.");
      }
      const r = await ask(admin, doc, READ_PROMPT, BATCH_SCHEMA, batchResult, [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") },
        },
        { type: "text", text: partNote(1, 1, 1, doc.title) },
      ]);
      const desc = r.pages
        .map((p) => p.description)
        .join(" ")
        .trim();
      state.notes!.push({ page: 1, description: desc });
      state.facts!.push(...r.facts.map((f) => ({ ...f, page: f.page ?? 1 })));
      await saveChunks(admin, doc, [{ page: 1, seq: 100, text: desc }], { seqFrom: 0, seqTo: 199 });
      state.next = 2;
      await save();
    }
  } else {
    let text: string;
    try {
      text = type === "docx" ? await docxText(bytes) : new TextDecoder().decode(bytes);
    } catch {
      throw new ReadError("That Word file couldn't be opened. Try saving it as a PDF.");
    }
    if (!text.trim()) throw new ReadError("That file has no text in it.");
    const sections = splitText(text, SECTION_CHARS);
    state.total = sections.length;
    while (state.next! <= sections.length) {
      if (Date.now() > deadline) {
        await save();
        return "more";
      }
      const i = state.next!;
      await setProgress(
        admin,
        doc.id,
        sections.length === 1 ? "Reading the text" : `Reading part ${i} of ${sections.length}`,
      );
      const r = await ask(admin, doc, READ_PROMPT, BATCH_SCHEMA, batchResult, [
        {
          type: "text",
          text: `<document_text part="${i} of ${sections.length}">\n${sections[i - 1]}\n</document_text>\n\nThis is part ${i} of ${sections.length} of “${doc.title}”. It has no page numbers: use null for page and return an empty pages list.`,
        },
      ]);
      state.facts!.push(...r.facts.map((f) => ({ ...f, page: null })));
      await saveChunks(
        admin,
        doc,
        splitText(sections[i - 1], CHUNK_CHARS).map((t, j) => ({
          page: null,
          seq: i * 1000 + j,
          text: t,
        })),
        { seqFrom: i * 1000, seqTo: i * 1000 + 999 },
      );
      state.next = i + 1;
      await save();
    }
  }

  if (Date.now() > deadline) {
    await save();
    return "more";
  }
  await finish(admin, doc, state);
  return "done";
}

/** The summary, key facts and follow-up, once every part has been read. */
async function finish(admin: SupabaseClient, doc: Doc, state: ReadState) {
  await setProgress(admin, doc.id, "Pulling out the key points");
  const today = todayIn(undefined);
  const record = await loadRecord(admin, doc.project_id, today);
  const notes = (state.notes ?? [])
    .map((n) => `p.${n.page ?? "-"}: ${n.description.slice(0, 700)}`)
    .join("\n");
  const facts = (state.facts ?? [])
    .slice(0, 500)
    .map((f) => `- [${f.topic}] ${f.detail}${f.page ? ` (p.${f.page})` : ""}`)
    .join("\n");
  const list = record.decisions.map((d) => `${d.title} | ${d.room}`).join("\n") || "(empty)";
  const r = await ask(admin, doc, FINISH_PROMPT, FINISH_SCHEMA, finishResult, [
    {
      type: "text",
      text: `File name: ${doc.file!.original_name}\nPages or parts: ${state.total ?? 1}\nToday: ${today}\n\n<page_notes>\n${notes || "(none)"}\n</page_notes>\n\n<facts_found>\n${facts || "(none)"}\n</facts_found>\n\n<decision_list title_and_room>\n${list}\n</decision_list>`,
    },
  ]);

  await admin.from("document_facts").delete().eq("document_id", doc.id);
  if (r.facts.length) {
    await admin.from("document_facts").insert(
      r.facts.map((f, i) => ({
        document_id: doc.id,
        project_id: doc.project_id,
        topic: f.topic,
        detail: f.detail,
        page: f.page,
        sort_order: i,
      })),
    );
  }
  await admin
    .from("documents")
    .update({
      kind: r.kind,
      title: r.title,
      summary: r.summary,
      page_count: state.total ?? null,
      status: "ready",
      progress: null,
      error: null,
      details: {
        contract_price_cents: r.contract_price_cents,
        allowances: r.allowances,
        start_date: r.start_date,
        completion_date: r.completion_date,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  await admin.from("events").insert({
    project_id: doc.project_id,
    actor_id: doc.created_by,
    type: "document",
    entity_type: "document",
    entity_id: doc.id,
    summary: `Document added: ${r.title}`,
    after: { kind: r.kind, pages: state.total ?? null },
  });

  // Tell the chat, and offer the decisions the document names that aren't on the list.
  const ctx = {
    ...record,
    facts: [],
    imageFileIds: [],
  };
  const cards = r.new_decisions
    .map((d) =>
      buildCard(
        {
          name: "add_decision",
          input: {
            title: d.title,
            room: d.room,
            category: d.category,
            milestone_key: d.milestone_key,
            lead_weeks: d.lead_weeks,
            why: d.page ? `${d.why} (${r.title}, p.${d.page})` : d.why,
            bucket_id: null,
          },
        },
        ctx,
      ),
    )
    .filter((c): c is Card => c != null && c.warnings.length === 0)
    .slice(0, MAX_FOLLOW_UP_CARDS);
  const named = Math.max(r.decisions_named, cards.length);
  let text = `I read “${r.title}”. ${r.summary}`;
  const things = `${named} thing${named === 1 ? "" : "s"}`;
  if (named > 0)
    text += !cards.length
      ? `\n\nIt names ${things} you’ll need to decide, and ${named === 1 ? "it’s" : "they’re all"} already on your list.`
      : cards.length === 1 && named === 1
        ? `\n\nIt names 1 thing that should be on your decision list, and it isn’t there yet. Want me to add it?`
        : `\n\nIt names ${things} that should be on your decision list. Want me to add the ${cards.length} that ${cards.length === 1 ? "isn’t" : "aren’t"} there yet?`;
  const { data: msg } = await admin
    .from("messages")
    .insert({ project_id: doc.project_id, role: "assistant", text })
    .select("id")
    .single();
  if (msg && cards.length) {
    await admin
      .from("proposals")
      .insert(cards.map((c) => ({ project_id: doc.project_id, message_id: msg.id, ...c })));
  }
}
