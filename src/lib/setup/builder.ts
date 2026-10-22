import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiError, askStructured } from "@/lib/ai/structured";
import { todayIn } from "@/lib/record/dates";
import { loadRecord } from "@/lib/record/load";
import { money } from "@/lib/record/money";
import { answersSchema, normalizePlan, PLAN_SCHEMA, planSchema } from "./plan";
import { SETUP_PROMPT } from "./prompt";

export type SetupJob = { id: string; payload: { plan_id: string; project_id: string } };

type DocRow = {
  title: string;
  kind: string;
  summary: string | null;
  details: Record<string, unknown> | null;
  document_facts: { topic: string; detail: string; page: number | null; sort_order: number }[];
};

/** Drafts the plan for a setup request and stores it, ready for the preview. */
export async function buildSetup(admin: SupabaseClient, job: SetupJob) {
  const { data: row } = await admin
    .from("setup_plans")
    .select("id, project_id, created_by, status, answers")
    .eq("id", job.payload.plan_id)
    .maybeSingle();
  if (!row || row.status !== "building") return;
  const answers = answersSchema.safeParse(row.answers);
  if (!answers.success) throw new AiError("Those answers didn't come through. Please try again.");
  const a = answers.data;
  const progress = (p: string) =>
    admin
      .from("setup_plans")
      .update({ progress: p, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  await progress("Reading your answers and documents");

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
  const lib = (library.data ?? [])
    .map(
      (l) =>
        `${l.category} | ${l.title} | ${l.area} | ${l.milestone_key} | ${l.lead_weeks} | ${l.why}`,
    )
    .join("\n");
  const existing = [
    "Stages: " +
      record.milestones
        .map((m) => `${m.key} = ${m.label}${m.date ? ` (${m.date})` : ""}`)
        .join("; "),
    "Budget lines: " +
      (record.buckets.map((b) => `${b.name} (${b.kind}, ${money(b.budget_cents)})`).join("; ") ||
        "none"),
    "Decisions (title | room):\n" +
      (record.decisions.map((d) => `${d.title} | ${d.room}`).join("\n") || "none"),
  ].join("\n");
  const answerText = [
    `What they're renovating: ${a.scope}`,
    `Construction start: ${a.start_date}`,
    `Target move-in: ${a.move_in ?? "not given"}`,
    `Contract price: ${a.contract_cents != null ? money(a.contract_cents) : "not given"}`,
    `Cushion set aside: ${a.cushion_cents != null ? money(a.cushion_cents) : "not given"}`,
    `Allowances: ${a.allowances.trim() || "not given"}`,
  ].join("\n");

  await progress("Building your decision map");
  const plan = await askStructured({
    admin,
    projectId: row.project_id,
    userId: row.created_by,
    purpose: "setup",
    system: SETUP_PROMPT,
    schema: PLAN_SCHEMA,
    check: planSchema,
    content: [
      {
        type: "text",
        text: `Today: ${today}\n\n<homeowner_answers>\n${answerText}\n</homeowner_answers>\n\n<documents>\n${docText || "(none uploaded)"}\n</documents>\n\n<already_in_project>\n${existing}\n</already_in_project>\n\n<decision_library columns="category | title | area | stage | lead weeks | why">\n${lib}\n</decision_library>`,
      },
    ],
  });

  // Saved only if it's still the draft being waited for.
  await admin
    .from("setup_plans")
    .update({
      plan: normalizePlan(plan),
      status: "ready",
      progress: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "building");
}
