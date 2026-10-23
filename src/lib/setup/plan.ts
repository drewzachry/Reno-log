import { z } from "zod";
import { addDays } from "@/lib/record/dates";
import type { BucketKind, ISODate } from "@/lib/record/types";

/** The stages every project has, in order. */
export const STAGES = [
  "rough_in",
  "drywall",
  "cabinets",
  "countertops",
  "finish",
  "move_in",
] as const;
export type StageKey = (typeof STAGES)[number];

/** What the homeowner told us. Money in cents. */
export const answersSchema = z.object({
  scope: z.string().trim().min(1).max(2000),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  move_in: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  contract_cents: z.number().int().min(0).max(1_000_000_000).nullable(),
  cushion_cents: z.number().int().min(0).max(1_000_000_000).nullable(),
  allowances: z.string().max(2000),
});
export type Answers = z.infer<typeof answersSchema>;

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Structured-output schema for the draft plan (docs/AI_BEHAVIOR.md section 3). */
export const PLAN_SCHEMA = obj({
  scope: { type: "string", description: "One-line summary of the job." },
  milestones: obj(
    Object.fromEntries(STAGES.map((k) => [k, { type: "string", description: "YYYY-MM-DD" }])),
  ),
  buckets: {
    type: "array",
    items: obj({
      key: { type: "string", description: "Short slug, e.g. 'tile'." },
      name: { type: "string" },
      kind: { type: "string", enum: ["contract", "allowance", "owner", "contingency"] },
      budget_cents: { type: "integer" },
    }),
  },
  decisions: {
    type: "array",
    items: obj({
      title: { type: "string" },
      room: { type: "string" },
      category: { type: ["string", "null"] },
      milestone_key: { type: "string", enum: [...STAGES] },
      lead_weeks: { type: "integer" },
      why: { type: "string" },
      bucket_key: { type: ["string", "null"] },
      status: { type: "string", enum: ["not_started", "decided"] },
      selection: { type: ["string", "null"] },
      source: { type: ["string", "null"], description: "Document and page, e.g. 'Plans p.A-201'." },
    }),
  },
});

const text = (max: number) => z.string().trim().min(1).max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((s) => (s?.trim() ? s.trim() : null));

export const planSchema = z.object({
  scope: z.string().max(500),
  milestones: z.object(
    Object.fromEntries(STAGES.map((k) => [k, isoDate])) as Record<StageKey, typeof isoDate>,
  ),
  buckets: z
    .array(
      z.object({
        key: text(60),
        name: text(120),
        kind: z.enum(["contract", "allowance", "owner", "contingency"]),
        budget_cents: z.number().int().min(0).max(1_000_000_000),
      }),
    )
    .max(30),
  decisions: z
    .array(
      z.object({
        title: text(200),
        room: text(100),
        category: nullableText(100),
        milestone_key: z.enum(STAGES),
        lead_weeks: z.number().int().min(0).max(104),
        why: z.string().max(500),
        bucket_key: z.string().max(60).nullable(),
        status: z.enum(["not_started", "decided"]),
        selection: nullableText(500),
        source: nullableText(200),
      }),
    )
    .min(1)
    .max(250),
});
export type Plan = z.infer<typeof planSchema>;

const same = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Tidies a validated draft: stage dates in order (one that falls on or before
 * the stage before moves to a week after it), one budget line per key and name,
 * decisions pointing only at budget lines that exist, no duplicate decisions,
 * and "decided" only with a selection.
 */
export function normalizePlan(plan: Plan): Plan {
  const milestones = { ...plan.milestones };
  let prev: ISODate | null = null;
  for (const k of STAGES) {
    if (prev && milestones[k] <= prev) milestones[k] = addDays(prev, 7);
    prev = milestones[k];
  }
  const buckets: Plan["buckets"] = [];
  for (const b of plan.buckets) {
    if (buckets.some((x) => x.key === b.key || same(x.name, b.name))) continue;
    buckets.push(b);
  }
  const keys = new Set(buckets.map((b) => b.key));
  const decisions: Plan["decisions"] = [];
  for (const d of plan.decisions) {
    if (decisions.some((x) => same(x.title, d.title) && same(x.room, d.room))) continue;
    decisions.push({
      ...d,
      bucket_key: d.bucket_key && keys.has(d.bucket_key) ? d.bucket_key : null,
      status: d.status === "decided" && d.selection ? "decided" : "not_started",
      selection: d.status === "decided" ? d.selection : null,
    });
  }
  return { scope: plan.scope.trim(), milestones, buckets, decisions: decisions.slice(0, 250) };
}

export type Existing = {
  milestones: { key: string; label: string; date: ISODate | null }[];
  buckets: { name: string; kind: BucketKind; budget_cents: number }[];
  decisions: { title: string; room: string }[];
};

/**
 * What saving the plan would do to the project as it is now. Mirrors the
 * rules in apply_setup: dates only where none is set, budget lines by name,
 * decisions by title and room.
 */
export function previewPlan(plan: Plan, existing: Existing) {
  const dates = STAGES.map((k) => {
    const m = existing.milestones.find((x) => x.key === k);
    return {
      key: k,
      label: m?.label ?? k,
      planned: plan.milestones[k],
      kept: m?.date ?? null,
    };
  });
  const buckets = plan.buckets.map((b) => ({
    ...b,
    exists: existing.buckets.some((x) => same(x.name, b.name)),
  }));
  const add = plan.decisions.filter(
    (d) => !existing.decisions.some((x) => same(x.title, d.title) && same(x.room, d.room)),
  );
  return {
    dates,
    buckets,
    add,
    skipped: plan.decisions.length - add.length,
    counts: {
      decisions: add.length,
      decided: add.filter((d) => d.status === "decided").length,
      buckets: buckets.filter((b) => !b.exists).length,
      dates: dates.filter((d) => !d.kept).length,
    },
  };
}
