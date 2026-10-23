import { z } from "zod";

/**
 * What a change to the record looks like. Validated on the server before
 * anything is written, because in Phase 3 these come from the AI.
 */
const isoDate = z.iso.date();
const statuses = z.enum([
  "not_started",
  "exploring",
  "decided",
  "ordered",
  "delivered",
  "installed",
]);

export const proposalSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update_decision"),
    decision_id: z.uuid(),
    status: statuses.optional(),
    selection: z.string().trim().max(500).nullable().optional(),
    cost_cents: z.number().int().min(0).max(1e11).nullable().optional(),
    bucket_id: z.uuid().nullable().optional(),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    type: z.literal("save_funding_source"),
    project_id: z.uuid(),
    id: z.uuid().nullable(),
    name: z.string().trim().min(1).max(80),
    amount_cents: z.number().int().min(0).max(1e11),
  }),
  z.object({
    type: z.literal("remove_funding_source"),
    project_id: z.uuid(),
    id: z.uuid(),
  }),
  z.object({
    type: z.literal("set_invoice_paid"),
    entry_id: z.uuid(),
    paid: z.boolean(),
  }),
  z.object({
    type: z.literal("move_milestone"),
    project_id: z.uuid(),
    milestone_key: z.string().regex(/^[a-z_]{1,40}$/),
    date: isoDate,
    reason: z.string().trim().max(1000).optional(),
  }),
]);

export type Proposal = z.infer<typeof proposalSchema>;
