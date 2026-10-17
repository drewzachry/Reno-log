import { z } from "zod";
import { STATUSES } from "@/lib/record/types";

/**
 * The record changes the assistant can propose, one tool each. The JSON
 * schemas are strict (every property required, optional ones nullable) so the
 * API guarantees their shape; the Zod schemas check them again, because model
 * output is untrusted until it has been validated.
 */

const STATUS_KEYS = STATUSES.map(([k]) => k);
const FACT_CATEGORIES = ["preference", "constraint", "person", "vendor", "other"] as const;

type Prop = Record<string, unknown>;
const str = (description: string): Prop => ({ type: "string", description });
const nstr = (description: string): Prop => ({ type: ["string", "null"], description });
const int = (description: string): Prop => ({ type: "integer", description });
const nint = (description: string): Prop => ({ type: ["integer", "null"], description });
const date = (description: string): Prop => ({ type: "string", description });
const ndate = (description: string): Prop => ({ type: ["string", "null"], description });

function tool(name: string, description: string, properties: Record<string, Prop>) {
  return {
    name,
    description,
    strict: true,
    input_schema: {
      type: "object" as const,
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

export const TOOLS = [
  tool(
    "log_invoice",
    "Propose logging an invoice, receipt, payment or credit to the ledger. Read the vendor, date, total and purpose from what the homeowner said or from an attached image. If you can't read the amount, ask instead of calling this.",
    {
      vendor: str("Who billed or was paid, e.g. 'Rivera Plumbing'."),
      date: ndate("Invoice or payment date (YYYY-MM-DD). Null if unknown; today is used."),
      amount_cents: int("The total in cents, e.g. 240000 for $2,400.00."),
      bucket_id: nstr("Id of the budget line this belongs to, from the briefing. Null if unsure."),
      description: str("Short plain description of what it's for."),
      kind: {
        type: "string",
        enum: ["invoice", "payment", "credit"],
        description: "invoice = a bill; payment = money paid; credit = money back.",
      },
      image_index: nint("Index (0-based) of the attached image this was read from, or null."),
      flags: {
        type: "array",
        items: { type: "string" },
        description:
          "Short tags of a few words each (under 40 characters), e.g. 'Possible duplicate', 'Work not in contract?', 'Large deposit'. At most 3. Explain them in your reply, not here. Empty if none.",
      },
    },
  ),
  tool(
    "log_change_order",
    "Propose logging a change order: a change to the contracted work that changes the price.",
    {
      vendor: nstr("Who is doing the work, or null for the general contractor."),
      description: str("What changes, in plain words."),
      amount_cents: int("Added cost in cents (use 0 for no-cost changes)."),
      bucket_id: nstr("Id of the budget line this is charged to, from the briefing, or null."),
      status: {
        type: "string",
        enum: ["proposed", "approved"],
        description: "approved only if the homeowner said they agreed to it.",
      },
      reason: nstr("Why the change is needed, if known."),
      image_index: nint("Index (0-based) of the attached image this was read from, or null."),
    },
  ),
  tool(
    "update_decision",
    "Propose updating an existing decision: its status, the selection made, or its cost. Match the homeowner's words to a decision in the briefing first. Fields left null are unchanged.",
    {
      decision_id: str("Id of the decision, exactly as in the briefing."),
      status: {
        type: "string",
        enum: [...STATUS_KEYS, "unchanged"],
        description: "New status, or 'unchanged'.",
      },
      selection: nstr(
        "What was picked, with brand, model, color and size where known, or null to leave it.",
      ),
      cost_cents: nint("Cost of the selection in cents, or null to leave it."),
      note: nstr("Why it changed, in a few words, or null."),
    },
  ),
  tool(
    "add_decision",
    "Propose adding a decision the homeowner must make that isn't in the briefing yet.",
    {
      title: str("Short name, e.g. 'Shower niche size'."),
      room: str("Room it belongs to, using the homeowner's room names, or 'Whole house'."),
      category: nstr("Category, e.g. 'Tile', 'Lighting', or null."),
      milestone_key: {
        type: "string",
        enum: ["rough_in", "drywall", "cabinets", "countertops", "finish", "move_in"],
        description: "The stage it must be decided before.",
      },
      lead_weeks: int(
        "Weeks before that stage it must be decided (ordering lead time). 0 if none.",
      ),
      why: str("One plain sentence on why it matters by then."),
      bucket_id: nstr("Id of the budget line it's paid from, from the briefing, or null."),
    },
  ),
  tool(
    "move_milestone",
    "Propose moving a project stage to a new date, e.g. when the contractor says drywall moved. Deadlines that depend on it move too.",
    {
      milestone_key: {
        type: "string",
        enum: ["rough_in", "drywall", "cabinets", "countertops", "finish", "move_in"],
        description: "Which stage.",
      },
      date: date("The new date (YYYY-MM-DD)."),
      reason: nstr("Why it moved, if said."),
    },
  ),
  tool("add_photo", "Propose filing an attached site or progress photo with a room and caption.", {
    image_index: int("Index (0-based) of the attached image."),
    room: nstr("Room shown, or null."),
    caption: str("What the photo shows, in a few words."),
    decision_id: nstr("Id of a related decision from the briefing, or null."),
  }),
  tool(
    "remember_fact",
    "Propose remembering a lasting preference, constraint, or who's who that isn't a decision, e.g. 'We want brushed nickel everywhere', 'Kate makes the final call on tile'.",
    {
      fact: str("The fact, as one short sentence."),
      category: { type: "string", enum: [...FACT_CATEGORIES], description: "What kind of fact." },
    },
  ),
  tool(
    "add_note",
    "Propose adding a dated note to the project history, for news that doesn't fit the other tools.",
    {
      text: str("The note."),
      room: nstr("Room it's about, or null."),
    },
  ),
];

const id = z.string().min(1).max(64);
const cents = z.number().int().min(0).max(1_000_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const ntext = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((s) => (s?.trim() ? s.trim() : null));
const index = z.number().int().min(0).max(20);
const milestone = z.enum(["rough_in", "drywall", "cabinets", "countertops", "finish", "move_in"]);

export const toolInputSchemas = {
  log_invoice: z.object({
    vendor: text(200),
    date: isoDate.nullable(),
    amount_cents: cents,
    bucket_id: id.nullable(),
    description: z.string().max(500),
    kind: z.enum(["invoice", "payment", "credit"]),
    image_index: index.nullable(),
    flags: z.array(z.string().trim().min(1).max(200)).max(5),
  }),
  log_change_order: z.object({
    vendor: ntext(200),
    description: text(500),
    amount_cents: cents,
    bucket_id: id.nullable(),
    status: z.enum(["proposed", "approved"]),
    reason: ntext(500),
    image_index: index.nullable(),
  }),
  update_decision: z.object({
    decision_id: id,
    status: z.enum([...STATUS_KEYS, "unchanged"]).transform((s) => (s === "unchanged" ? null : s)),
    selection: ntext(500),
    cost_cents: cents.nullable(),
    note: ntext(300),
  }),
  add_decision: z.object({
    title: text(200),
    room: text(100),
    category: ntext(100),
    milestone_key: milestone,
    lead_weeks: z.number().int().min(0).max(104),
    why: z.string().max(500),
    bucket_id: id.nullable(),
  }),
  move_milestone: z.object({
    milestone_key: milestone,
    date: isoDate,
    reason: ntext(300),
  }),
  add_photo: z.object({
    image_index: index,
    room: ntext(100),
    caption: text(300),
    decision_id: id.nullable(),
  }),
  remember_fact: z.object({
    fact: text(500),
    category: z.enum(FACT_CATEGORIES),
  }),
  add_note: z.object({
    text: text(1000),
    room: ntext(100),
  }),
} as const;

export type ToolName = keyof typeof toolInputSchemas;
export type ToolInput<T extends ToolName> = z.infer<(typeof toolInputSchemas)[T]>;
export type ToolCall = { [K in ToolName]: { name: K; input: ToolInput<K> } }[ToolName];

export const MAX_PROPOSALS = 5;

/** Validates the assistant's tool calls; drops unknown or malformed ones, keeps at most five. */
export function parseToolCalls(blocks: { type: string; name?: string; input?: unknown }[]) {
  const calls: ToolCall[] = [];
  let rejected = 0;
  for (const b of blocks) {
    if (b.type !== "tool_use") continue;
    const schema = toolInputSchemas[b.name as ToolName];
    const parsed = schema?.safeParse(b.input);
    if (!parsed?.success) {
      rejected++;
      continue;
    }
    if (calls.length >= MAX_PROPOSALS) continue;
    calls.push({ name: b.name, input: parsed.data } as ToolCall);
  }
  return { calls, rejected };
}
