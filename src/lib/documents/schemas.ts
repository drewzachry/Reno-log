import { z } from "zod";

/**
 * What the document reader asks Claude for, as JSON Schemas for structured
 * output, with Zod schemas that check the answers again. Structured output
 * doesn't allow length or count limits in the schema, so Zod enforces them.
 */

export const TOPICS = [
  "Scope",
  "Rooms",
  "Fixtures & finishes",
  "Allowances",
  "Price & payments",
  "Schedule",
  "Exclusions",
  "Owner responsibilities",
  "Change orders",
  "Warranty",
  "Other",
] as const;

export const KINDS = [
  "plans",
  "contract",
  "specs",
  "estimate",
  "permit",
  "schedule",
  "inspection",
  "other",
] as const;

const MILESTONES = ["rough_in", "drywall", "cabinets", "countertops", "finish", "move_in"] as const;

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const fact = obj({
  topic: { type: "string", enum: [...TOPICS] },
  detail: {
    type: "string",
    description: "One specific point, with numbers, sizes, models and amounts.",
  },
  page: { type: ["integer", "null"], description: "Page number in the whole document, or null." },
});

/** One batch of pages (or a section of text, or one image). */
export const BATCH_SCHEMA = obj({
  pages: {
    type: "array",
    description:
      "One entry per page in this batch: what the page shows, in words, so it can be searched. For drawings: rooms, dimensions, fixture and finish callouts, notes. For text pages: a one-line gist.",
    items: obj({ page: { type: "integer" }, description: { type: "string" } }),
  },
  facts: { type: "array", items: fact },
});

/** The whole document, from the batch results. */
export const FINISH_SCHEMA = obj({
  kind: { type: "string", enum: [...KINDS] },
  title: { type: "string", description: "Short name, e.g. 'Architectural plans (permit set)'." },
  summary: { type: "string", description: "2-3 plain sentences: what it is and why it matters." },
  facts: { type: "array", items: fact, description: "The 5-40 points that matter most." },
  contract_price_cents: { type: ["integer", "null"] },
  allowances: {
    type: "array",
    items: obj({ name: { type: "string" }, amount_cents: { type: "integer" } }),
  },
  start_date: { type: ["string", "null"], description: "YYYY-MM-DD, or null." },
  completion_date: { type: ["string", "null"], description: "YYYY-MM-DD, or null." },
  decisions_named: {
    type: "integer",
    description: "How many things the document says the owner must choose, buy or supply.",
  },
  new_decisions: {
    type: "array",
    description: "Those of them NOT already on the homeowner's decision list.",
    items: obj({
      title: { type: "string" },
      room: { type: "string" },
      category: { type: ["string", "null"] },
      milestone_key: { type: "string", enum: [...MILESTONES] },
      lead_weeks: { type: "integer" },
      why: { type: "string" },
      page: { type: ["integer", "null"] },
    }),
  },
});

const text = (max: number) => z.string().trim().min(1).max(max);
const page = z.number().int().min(1).max(5000).nullable();
const factSchema = z.object({
  topic: z.enum(TOPICS).catch("Other"),
  detail: text(800),
  page,
});
const cents = z.number().int().min(0).max(1_000_000_000);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);

export const batchResult = z.object({
  pages: z
    .array(z.object({ page: z.number().int().min(1).max(5000), description: z.string().max(4000) }))
    .max(200),
  facts: z.array(factSchema).max(80),
});

export const finishResult = z.object({
  kind: z.enum(KINDS).catch("other"),
  title: text(200),
  summary: text(2000),
  facts: z.array(factSchema).max(60),
  contract_price_cents: cents.nullable().catch(null),
  allowances: z
    .array(z.object({ name: text(200), amount_cents: cents }))
    .max(30)
    .catch([]),
  start_date: isoDate,
  completion_date: isoDate,
  decisions_named: z.number().int().min(0).max(500).catch(0),
  new_decisions: z
    .array(
      z.object({
        title: text(200),
        room: text(100),
        category: z.string().max(100).nullable(),
        milestone_key: z.enum(MILESTONES),
        lead_weeks: z.number().int().min(0).max(104),
        why: z.string().max(500),
        page,
      }),
    )
    .max(40)
    .catch([]),
});

export type Fact = z.infer<typeof factSchema>;
export type BatchResult = z.infer<typeof batchResult>;
export type FinishResult = z.infer<typeof finishResult>;

/** The model's JSON text, parsed and checked; null when it doesn't fit. */
export function parseJson<T>(schema: z.ZodType<T>, raw: string): T | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
