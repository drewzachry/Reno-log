import "server-only";
import { z } from "zod";
import { userMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * The one way the project record changes. Each proposal type maps to a
 * database function that checks the caller's role, applies the change and
 * writes the history event in one transaction. Edits made directly in the UI
 * come through here too, so they're logged the same way. In Phase 3 the chat's
 * proposal cards will call this with what the AI proposed, after the person
 * taps "Log it"; that's why the payload is validated again here.
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
    type: z.literal("move_milestone"),
    project_id: z.uuid(),
    milestone_key: z.string().regex(/^[a-z_]{1,40}$/),
    date: isoDate,
    reason: z.string().trim().max(1000).optional(),
  }),
]);

export type Proposal = z.infer<typeof proposalSchema>;

export type MovedDeadline = {
  decision_id: string;
  title: string;
  room: string;
  status: string;
  old_decide_by: string | null;
  new_decide_by: string;
};

export type ApplyResult = { ok: true; moved?: MovedDeadline[] } | { ok: false; error: string };

export async function applyProposal(input: unknown): Promise<ApplyResult> {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "That change doesn't look right. Please try again." };
  const p = parsed.data;
  const supabase = await createClient();

  if (p.type === "update_decision") {
    const changes: Record<string, unknown> = {};
    for (const k of ["status", "selection", "cost_cents", "bucket_id"] as const) {
      if (p[k] !== undefined) changes[k] = p[k];
    }
    const { error } = await supabase.rpc("update_decision", {
      p_decision_id: p.decision_id,
      p_changes: changes,
      p_reason: p.reason ?? null,
    });
    return error ? { ok: false, error: userMessage(error) } : { ok: true };
  }

  const { data, error } = await supabase.rpc("move_milestone", {
    p_project_id: p.project_id,
    p_key: p.milestone_key,
    p_date: p.date,
    p_reason: p.reason ?? null,
  });
  return error
    ? { ok: false, error: userMessage(error) }
    : { ok: true, moved: (data ?? []) as MovedDeadline[] };
}
