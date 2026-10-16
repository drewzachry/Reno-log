import "server-only";
import { userMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { proposalSchema } from "./proposals";

export type { Proposal } from "./proposals";

/**
 * The one way the project record changes. Each proposal type maps to a
 * database function that checks the caller's role, applies the change and
 * writes the history event in one transaction. Edits made directly in the UI
 * come through here too, so they're logged the same way. In Phase 3 the chat's
 * proposal cards will call this with what the AI proposed, after the person
 * taps "Log it"; that's why the payload is validated again here.
 */

export type MovedDeadline = {
  decision_id: string;
  title: string;
  room: string;
  status: string;
  old_decide_by: string | null;
  new_decide_by: string;
};

export type ApplyResult = { ok: true; moved?: MovedDeadline[] } | { ok: false; error: string };

/** Logs the database's reason (code and message only, no user data) for Vercel's logs. */
function fail(type: string, error: { code?: string; message?: string }): ApplyResult {
  console.error("applyProposal failed", type, error.code, error.message);
  return { ok: false, error: userMessage(error) };
}

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
    return error ? fail(p.type, error) : { ok: true };
  }

  if (p.type === "save_funding_source") {
    const { error } = await supabase.rpc("save_funding_source", {
      p_project_id: p.project_id,
      p_id: p.id,
      p_name: p.name,
      p_amount_cents: p.amount_cents,
    });
    return error ? fail(p.type, error) : { ok: true };
  }

  if (p.type === "remove_funding_source") {
    const { error } = await supabase.rpc("remove_funding_source", {
      p_project_id: p.project_id,
      p_id: p.id,
    });
    return error ? fail(p.type, error) : { ok: true };
  }

  const { data, error } = await supabase.rpc("move_milestone", {
    p_project_id: p.project_id,
    p_key: p.milestone_key,
    p_date: p.date,
    p_reason: p.reason ?? null,
  });
  return error ? fail(p.type, error) : { ok: true, moved: (data ?? []) as MovedDeadline[] };
}
