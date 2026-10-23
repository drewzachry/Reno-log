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

export const AREAS = ["bath", "kitchen", "laundry", "basement", "addition", "exterior"] as const;
export type Area = (typeof AREAS)[number] | "whole";

const nullable = (description?: string) => ({
  type: ["string", "null"],
  ...(description && { description }),
});
const decisionItem = obj({
  title: { type: "string" },
  room: { type: "string" },
  category: nullable(),
  milestone_key: { type: "string", enum: [...STAGES] },
  lead_weeks: { type: "integer" },
  why: { type: "string" },
  bucket_key: nullable(),
  status: { type: "string", enum: ["not_started", "decided"] },
  selection: nullable(),
  source: nullable("Document and page, e.g. 'Plans p.A-201'."),
});

/** Step 1: dates, budget lines and the rooms in the job. Short to write. */
export const SKELETON_SCHEMA = obj({
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
  rooms: {
    type: "array",
    description: "Every room or area being worked on, in the homeowner's words.",
    items: obj({ name: { type: "string" }, area: { type: "string", enum: [...AREAS] } }),
  },
});

/**
 * Step 2: changes to the decision list the app built from the library, by
 * number. Only the changes are written, so the answer stays short.
 */
export const DETAILS_SCHEMA = obj({
  skip: {
    type: "array",
    items: { type: "integer" },
    description: "Numbers of listed decisions the scope or documents clearly rule out.",
  },
  decided: {
    type: "array",
    items: obj({
      n: { type: "integer" },
      selection: { type: "string" },
      source: nullable("Document and page, e.g. 'Plans p.A-201'."),
    }),
  },
  links: {
    type: "array",
    description: "Listed decisions an allowance pays for.",
    items: obj({ n: { type: "integer" }, bucket_key: { type: "string" } }),
  },
  extra: {
    type: "array",
    description: "Decisions this job needs that aren't listed.",
    items: decisionItem,
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

export const skeletonSchema = z.object({
  scope: z.string().max(500),
  milestones: planSchema.shape.milestones,
  buckets: planSchema.shape.buckets,
  rooms: z.array(z.object({ name: text(100), area: z.enum(AREAS) })).max(40),
});
export type Skeleton = z.infer<typeof skeletonSchema>;

const n = z.number().int().min(0).max(1000);
export const detailsSchema = z.object({
  skip: z.array(n).max(500),
  decided: z.array(z.object({ n, selection: text(500), source: nullableText(200) })).max(500),
  links: z.array(z.object({ n, bucket_key: text(60) })).max(500),
  extra: planSchema.shape.decisions.element.array().max(150),
});
export type Details = z.infer<typeof detailsSchema>;

export type LibraryRow = {
  category: string;
  title: string;
  area: Area;
  milestone_key: StageKey;
  lead_weeks: number;
  why: string;
};

/**
 * Every library decision for every room it applies to: each bathroom gets all
 * the bathroom decisions, each kitchen all the kitchen ones, and whole-house
 * decisions appear once. Exterior ones appear once if the job has exterior work.
 */
export function expandLibrary(library: LibraryRow[], rooms: Skeleton["rooms"]): Plan["decisions"] {
  const out: Plan["decisions"] = [];
  const byArea = (a: string) => rooms.filter((r) => r.area === a).map((r) => r.name);
  for (const l of library) {
    const where =
      l.area === "whole"
        ? ["Whole house"]
        : l.area === "exterior"
          ? byArea("exterior").length
            ? ["Exterior"]
            : []
          : byArea(l.area);
    for (const room of where)
      out.push({
        title: l.title,
        room,
        category: l.category,
        milestone_key: l.milestone_key,
        lead_weeks: l.lead_weeks,
        why: l.why,
        bucket_key: null,
        status: "not_started",
        selection: null,
        source: null,
      });
  }
  return out;
}

/** The full plan: the skeleton, the library list with the model's changes, and its extras. */
export function assemblePlan(skeleton: Skeleton, base: Plan["decisions"], d: Details): Plan {
  const skip = new Set(d.skip);
  const decisions = base.map((x, i) => {
    const pick = d.decided.find((p) => p.n === i + 1);
    const link = d.links.find((l) => l.n === i + 1);
    return {
      ...x,
      bucket_key: link?.bucket_key ?? x.bucket_key,
      ...(pick && { status: "decided" as const, selection: pick.selection, source: pick.source }),
    };
  });
  return normalizePlan({
    scope: skeleton.scope,
    milestones: skeleton.milestones,
    buckets: skeleton.buckets,
    decisions: [...decisions.filter((_, i) => !skip.has(i + 1)), ...d.extra],
  });
}
