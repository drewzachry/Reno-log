import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { after } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { titleFromName } from "@/lib/documents/extract";
import { kickJobs } from "@/lib/documents/jobs";
import { userMessage } from "@/lib/errors";
import { siteOrigin } from "@/lib/origin";
import { loadRecord } from "@/lib/record/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildBriefing } from "./briefing";
import { buildCard, type Card } from "./cards";
import { SYSTEM_PROMPT } from "./prompt";
import { parseToolCalls, TOOLS } from "./tools";
import { pastTurns, type PastMessage } from "./turns";

export const turnRequestSchema = z.object({
  projectId: z.uuid(),
  text: z.string().max(4000),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(500),
        name: z.string().max(200),
        mime: z.string().max(100),
        size: z.number().int().min(0),
      }),
    )
    .max(8),
});
export type TurnRequest = z.infer<typeof turnRequestSchema>;
/** saved: the person's message was stored, so the composer can clear even on an error. */
export type TurnResult = { ok: true } | { ok: false; error: string; saved?: boolean };

const BUCKET = "project-files";
/** Longest side sent to the model; the original stays in Storage untouched. */
const IMAGE_MAX = 1568;
const HISTORY = 12;

function settings() {
  const limit = Number(process.env.CHAT_DAILY_LIMIT);
  const effort = process.env.CHAT_EFFORT;
  return {
    // Set CHAT_MODEL in Vercel to use a cheaper model for chat.
    model: process.env.CHAT_MODEL || "claude-opus-5-5",
    effort: (["low", "medium", "high"].includes(effort ?? "") ? effort : "medium") as
      "low" | "medium" | "high",
    dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 150,
  };
}

/** Downscales a photo for the model; null when it can't be read (e.g. a format sharp lacks). */
async function forModel(data: Blob) {
  try {
    const buf = await sharp(Buffer.from(await data.arrayBuffer()))
      .rotate()
      .resize({ width: IMAGE_MAX, height: IMAGE_MAX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return buf.toString("base64");
  } catch {
    return null;
  }
}

function apiErrorMessage(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return "The chat's API key isn't working. Check ANTHROPIC_API_KEY in Vercel.";
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError)
    return "I'm busy right now. Your message is saved; try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError)
    return "I couldn't reach the AI just now. Your message is saved; try again in a minute.";
  return "I couldn't answer that just now. Your message is saved; try again in a minute.";
}

/**
 * One chat turn: save the person's message and photos, brief the assistant
 * from the record, and store its reply with any proposed cards as pending.
 * Nothing in the record changes until someone taps "Log it".
 */
export async function chatTurn(req: TurnRequest): Promise<TurnResult> {
  const { model, effort, dailyLimit } = settings();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const admin = createAdminClient();
  if (!admin || !process.env.ANTHROPIC_API_KEY)
    return {
      ok: false,
      error: !admin
        ? "The chat isn't set up yet: SUPABASE_SERVICE_ROLE_KEY is missing in Vercel."
        : "The chat isn't set up yet: ANTHROPIC_API_KEY is missing in Vercel.",
    };

  const { data: member } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", req.projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return { ok: false, error: "You're not on this project." };

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("purpose", "chat")
    .gte("created_at", since);
  if ((count ?? 0) >= dailyLimit)
    return {
      ok: false,
      error: `You've sent ${dailyLimit} messages in the last day, the daily limit. Try again later.`,
    };

  // Register the originals the browser uploaded, then the message itself.
  const fileIds: string[] = [];
  for (const f of req.files) {
    const { data, error } = await supabase.rpc("record_file", {
      p_project_id: req.projectId,
      p_path: f.path,
      p_name: f.name,
      p_mime: f.mime || "application/octet-stream",
      p_size: f.size,
      p_kind: f.mime.startsWith("image/") ? "photo" : "document",
    });
    if (error) return { ok: false, error: userMessage(error) };
    fileIds.push(data as string);
  }
  const { data: messageId, error: postError } = await supabase.rpc("post_message", {
    p_project_id: req.projectId,
    p_text: req.text,
    p_file_ids: fileIds,
  });
  if (postError) return { ok: false, error: userMessage(postError) };

  // PDFs and other documents go to the document reader; the chat says when they're read.
  const startedReading: string[] = [];
  for (const [i, f] of req.files.entries()) {
    if (f.mime.startsWith("image/")) continue;
    const { error } = await supabase.rpc("add_document", {
      p_project_id: req.projectId,
      p_file_id: fileIds[i],
      p_title: titleFromName(f.name),
    });
    if (error) return { ok: false, error: userMessage(error), saved: true };
    startedReading.push(f.name);
  }
  if (startedReading.length) {
    const origin = await siteOrigin();
    after(() => kickJobs(origin));
  }

  // The briefing: the record, read fresh, under the person's own access.
  const [record, project, facts, recent, docs, excerpts] = await Promise.all([
    loadRecord(supabase, req.projectId),
    supabase.from("projects").select("name").eq("id", req.projectId).single(),
    supabase
      .from("project_facts")
      .select("fact, category")
      .eq("project_id", req.projectId)
      .is("retired_at", null)
      .order("created_at"),
    supabase
      .from("messages")
      .select("id, role, text, author_id, file_ids, proposals(kind_label, summary, state)")
      .eq("project_id", req.projectId)
      .neq("id", messageId)
      .order("created_at", { ascending: false })
      .limit(HISTORY),
    supabase
      .from("documents")
      .select("title, kind, summary, status, document_facts(topic, detail, page, sort_order)")
      .eq("project_id", req.projectId)
      .is("deleted_at", null)
      .order("created_at"),
    req.text.trim()
      ? supabase.rpc("search_documents", {
          p_project_id: req.projectId,
          p_query: req.text,
          p_limit: 8,
        })
      : { data: [] },
  ]);
  const briefing = buildBriefing({
    projectName: project.data?.name ?? "",
    facts: facts.data ?? [],
    documents: (docs.data ?? []).map((d) => ({
      title: d.title,
      kind: d.kind,
      summary: d.summary,
      status: d.status,
      facts: [...(d.document_facts ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    })),
    ...record,
  });
  const passages = ((excerpts.data ?? []) as { title: string; page: number | null; text: string }[])
    .map((e) => `[${e.title}${e.page ? `, p.${e.page}` : ""}]\n${e.text}`)
    .join("\n\n");

  const past = (recent.data ?? []).reverse();
  const authorIds = [...new Set(past.map((m) => m.author_id).filter(Boolean))] as string[];
  const { data: people } = authorIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", authorIds)
    : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.display_name as string | null]));
  const turns = pastTurns(
    past.map((m): PastMessage => ({
      role: m.role as PastMessage["role"],
      text: m.text,
      author: m.author_id ? (nameOf.get(m.author_id) ?? null) : null,
      fileCount: (m.file_ids ?? []).length,
      cards: (m.proposals ?? []) as PastMessage["cards"],
    })),
  );
  // A question left unanswered (say, after an error) rides along with this one.
  const carried = turns.at(-1)?.role === "user" ? turns.pop()!.content + "\n\n" : "";

  // Photos on this message, downscaled for the model.
  const images: { fileId: string; data: string }[] = [];
  const skipped: string[] = [];
  for (const [i, f] of req.files.entries()) {
    if (!f.mime.startsWith("image/")) continue;
    const { data } = await supabase.storage.from(BUCKET).download(f.path);
    const b64 = data && (await forModel(data));
    if (b64) images.push({ fileId: fileIds[i], data: b64 });
    else skipped.push(f.name);
  }
  const me =
    nameOf.get(user.id) ??
    (await supabase.from("profiles").select("display_name").eq("id", user.id).single()).data
      ?.display_name;
  const content: BetaContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `Image ${i}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: img.data },
    });
  });
  content.push({
    type: "text",
    text:
      carried +
      `${me ? `${me}: ` : ""}${req.text.trim() || "(sent without a message)"}` +
      (skipped.length ? `\n(Couldn't open: ${skipped.join(", ")})` : "") +
      (startedReading.length
        ? `\n(Attached documents, now being read in the background: ${startedReading.join(", ")}. Say you're reading them and will post a summary here when done; don't guess their contents.)`
        : "") +
      (passages
        ? `\n\n<document_excerpts>\nPassages from the project's documents that may answer this. Cite them as (Title, p.N).\n\n${passages}\n</document_excerpts>`
        : "") +
      (member.role === "viewer"
        ? "\n(This person is a Viewer: answer questions, but don't propose cards; they can't log changes.)"
        : ""),
  });
  const messages: BetaMessageParam[] = [...turns, { role: "user", content }];

  let reply: string;
  let cards: Card[] = [];
  try {
    const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: `<project_briefing>\n${briefing}\n</project_briefing>`,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS as unknown as BetaTool[],
      tool_choice: { type: "auto" },
      messages,
    });

    await admin.from("usage").insert({
      project_id: req.projectId,
      user_id: user.id,
      model: res.model,
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      cache_read_tokens: res.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: res.usage.cache_creation_input_tokens ?? 0,
    });

    if (res.stop_reason === "refusal") {
      reply = "I can't help with that one. Try asking another way.";
    } else {
      reply = res.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n\n")
        .trim();
      if (member.role !== "viewer") {
        const { calls, rejected } = parseToolCalls(res.content);
        if (rejected) console.error("chat: dropped malformed proposals", rejected);
        const ctx = {
          ...record,
          facts: facts.data ?? [],
          imageFileIds: images.map((i) => i.fileId),
        };
        cards = calls.map((c) => buildCard(c, ctx)).filter((c): c is Card => c != null);
      }
      if (!reply)
        reply = cards.length
          ? "Here's what I'd log. Check each card, then tap Log it."
          : "Sorry, I didn't catch that. Could you say it another way?";
    }
  } catch (e) {
    console.error(
      "chat: model call failed",
      e instanceof Anthropic.APIError ? e.status : "",
      e instanceof Error ? e.message : "",
    );
    return { ok: false, error: apiErrorMessage(e), saved: true };
  }

  const { data: saved, error: saveError } = await admin
    .from("messages")
    .insert({ project_id: req.projectId, role: "assistant", text: reply.slice(0, 8000) })
    .select("id")
    .single();
  if (saveError || !saved) {
    console.error("chat: saving reply failed", saveError?.code, saveError?.message);
    return { ok: false, error: userMessage(saveError), saved: true };
  }
  if (cards.length) {
    const { error } = await admin
      .from("proposals")
      .insert(cards.map((c) => ({ project_id: req.projectId, message_id: saved.id, ...c })));
    if (error) console.error("chat: saving cards failed", error.code, error.message);
  }
  return { ok: true };
}
