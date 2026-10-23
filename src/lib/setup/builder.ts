import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiError, askStructured } from "@/lib/ai/structured";
import { todayIn } from "@/lib/record/dates";
import { loadRecord } from "@/lib/record/load";
import { money } from "@/lib/record/money";
import {
  answersSchema,
  assemblePlan,
  DETAILS_SCHEMA,
  detailsSchema,
  expandLibrary,
  SKELETON_SCHEMA,
  skeletonSchema,
  type LibraryRow,
  type Skeleton,
} from "./plan";
import { DETAILS_PROMPT, SKELETON_PROMPT } from "./prompt";

export type SetupJob = {
  id: string;
  payload: { plan_id: string; project_id: string };
  state: { skeleton?: Skeleton };
};

type DocRow = {
  title: string;
  kind: string;
  summary: string | null;
  details: Record<string, unknown> | null;
  document_facts: { topic: string; detail: string; page: number | null; sort_order: number }[];
};

/** Each step is one short call; this is the most one may take. */
const STEP_TIMEOUT_MS = 200_000;

/**
 * Drafts the plan for a setup request in two steps, saving after the first,
 * and stores it ready for the preview. Returns "more" when the second step
 * should run in a fresh call (so neither gets near the time limit).
 */
export async function buildSetup(
  admin: SupabaseClient,
  job: SetupJob,
  mayStart: () => boolean,
): Promise<"done" | "more"> {
  const { data: row } = await admin
    .from("setup_plans")
    .select("id, project_id, created_by, status, answers")
    .eq("id", job.payload.plan_id)
    .maybeSingle();
  if (!row || row.status !== "building") return "done";
  const answers = answersSchema.safeParse(row.answers);
  if (!answers.success) throw new AiError("Those answers didn't come through. Please try again.");
  const a = answers.data;
  const progress = (p: string) =>
    admin
      .from("setup_plans")
      .update({ progress: p, updated_at: new Date().toISOString() })
      .eq("id", row.id);

  const today = todayIn(undefined);
  const [record, docs, library] = await Promise.all([
    loadRecord(admin, row.project_id, today),
    admin
      .from("documents")
      .select("title, kind, summary, details, document_facts(topic, detail, page, sort_order)")
      .eq("project_id", row.project_id)
      .eq("status", "ready")
      .is("deleted_at", null),
    admin
      .from("decision_library")
      .select("category, title, area, milestone_key, lead_weeks, why")
      .order("sort_order"),
  ]);

  const docText = ((docs.data ?? []) as DocRow[])
    .map((d) =>
      [
        `### ${d.title} (${d.kind})`,
        d.summary ?? "",
        d.details && Object.keys(d.details).length ? `Details: ${JSON.stringify(d.details)}` : "",
        ...[...(d.document_facts ?? [])]
          .sort((x, y) => x.sort_order - y.sort_order)
          .map((f) => `- [${f.topic}] ${f.detail}${f.page ? ` (p.${f.page})` : ""}`),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const answerText = [
    `What they're renovating: ${a.scope}`,
    `Construction start: ${a.start_date}`,
    `Target move-in: ${a.move_in ?? "not given"}`,
    `Contract price: ${a.contract_cents != null ? money(a.contract_cents) : "not given"}`,
    `Cushion set aside: ${a.cushion_cents != null ? money(a.cushion_cents) : "not given"}`,
    `Allowances: ${a.allowances.trim() || "not given"}`,
  ].join("\n");
  const context = `Today: ${today}\n\n<homeowner_answers>\n${answerText}\n</homeowner_answers>\n\n<documents>\n${docText || "(none uploaded)"}\n</documents>`;
  const ask = <T>(
    system: string,
    schema: object,
    check: Parameters<typeof askStructured<T>>[0]["check"],
    text: string,
  ) =>
    askStructured<T>({
      admin,
      projectId: row.project_id,
      userId: row.created_by,
      purpose: "setup",
      system,
      schema,
      check,
      timeoutMs: STEP_TIMEOUT_MS,
      content: [{ type: "text", text }],
    });

  // Step 1: dates, budget lines and rooms.
  let skeleton = job.state?.skeleton;
  if (!skeleton) {
    await progress("Working out your dates, budget and rooms");
    const existing = [
      "Stages: " +
        record.milestones
          .map((m) => `${m.key} = ${m.label}${m.date ? ` (${m.date})` : ""}`)
          .join("; "),
      "Budget lines: " +
        (record.buckets.map((b) => `${b.name} (${b.kind}, ${money(b.budget_cents)})`).join("; ") ||
          "none"),
      "Rooms on the decision list: " +
        ([...new Set(record.decisions.map((d) => d.room))].join("; ") || "none"),
    ].join("\n");
    skeleton = await ask(
      SKELETON_PROMPT,
      SKELETON_SCHEMA,
      skeletonSchema,
      `${context}\n\n<already_in_project>\n${existing}\n</already_in_project>`,
    );
    await admin.from("jobs").update({ state: { skeleton } }).eq("id", job.id);
    if (!mayStart()) {
      await progress("Matching decisions to your rooms and documents");
      return "more";
    }
  }

  // Step 2: the library for each room, adjusted to the documents.
  await progress("Matching decisions to your rooms and documents");
  const base = expandLibrary((library.data ?? []) as LibraryRow[], skeleton.rooms);
  const listed = base
    .map((d, i) => `${i + 1}. ${d.title} | ${d.room} | ${d.category ?? ""}`)
    .join("\n");
  const buckets =
    skeleton.buckets
      .map((b) => `${b.key}: ${b.name} (${b.kind}, ${money(b.budget_cents)})`)
      .join("\n") || "none";
  const details = await ask(
    DETAILS_PROMPT,
    DETAILS_SCHEMA,
    detailsSchema,
    `${context}\n\n<budget_lines>\n${buckets}\n</budget_lines>\n\n<listed_decisions columns="n. title | room | category">\n${listed}\n</listed_decisions>`,
  );

  // Saved only if it's still the draft being waited for.
  await admin
    .from("setup_plans")
    .update({
      plan: assemblePlan(skeleton, base, details),
      status: "ready",
      progress: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "building");
  return "done";
}
