"use server";

import { revalidatePath } from "next/cache";
import { userMessage } from "@/lib/errors";
import { bucketStats } from "@/lib/record/budget";
import { loadRecord } from "@/lib/record/load";
import { money } from "@/lib/record/money";
import { rippleMessage } from "@/lib/record/ripple";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { MovedDeadline } from "./applyProposal";

export type CardResult = { ok: true } | { ok: false; error: string };

/**
 * What changed, said back in the chat after a card is logged: which deadlines
 * a schedule change moved, or where a budget line stands now.
 */
async function followUp(
  projectId: string,
  type: string,
  payload: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  const supabase = await createClient();
  const record = await loadRecord(supabase, projectId);
  if (type === "move_milestone") {
    const m = record.milestones.find((x) => x.key === payload.milestone_key);
    const r = rippleMessage(
      m?.label ?? "Milestone",
      (result.moved ?? []) as MovedDeadline[],
      record.today,
    );
    return [r.headline, ...r.lines.map((l) => `• ${l}`)].join("\n");
  }
  let bucketId = payload.bucket_id as string | null | undefined;
  if (type === "update_decision") {
    const changes = (payload.changes ?? {}) as Record<string, unknown>;
    if (!("cost_cents" in changes) && !("status" in changes)) return null;
    bucketId = record.decisions.find((d) => d.id === payload.decision_id)?.bucket_id;
  } else if (type !== "log_invoice" && type !== "log_change_order") return null;
  const b = bucketId && record.buckets.find((x) => x.id === bucketId);
  if (!b) return null;
  const s = bucketStats(b, record.ledger, record.decisions);
  return s.left < 0
    ? `${b.name} is now ${money(-s.left)} over budget.`
    : `${b.name}: ${money(s.left)} left of ${money(b.budget_cents)}.`;
}

/** "Log it": applies the card in the database, then says what changed. */
export async function confirmCard(proposalId: string): Promise<CardResult> {
  const supabase = await createClient();
  const { data: card } = await supabase
    .from("proposals")
    .select("project_id, type, payload")
    .eq("id", proposalId)
    .maybeSingle();
  if (!card) return { ok: false, error: "That card isn't on this project." };
  const { data, error } = await supabase.rpc("confirm_proposal", { p_proposal_id: proposalId });
  if (error) {
    console.error("confirmCard failed", card.type, error.code, error.message);
    return { ok: false, error: userMessage(error) };
  }
  try {
    const text = await followUp(card.project_id, card.type, card.payload, data ?? {});
    const admin = createAdminClient();
    if (text && admin)
      await admin.from("messages").insert({ project_id: card.project_id, role: "assistant", text });
  } catch (e) {
    console.error("confirmCard follow-up failed", e instanceof Error ? e.message : "");
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "Not now". */
export async function dismissCard(proposalId: string): Promise<CardResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_proposal", { p_proposal_id: proposalId });
  if (error) return { ok: false, error: userMessage(error) };
  revalidatePath("/");
  return { ok: true };
}

/** Project settings: stop using a remembered fact. It stays in history. */
export async function forgetFact(factId: string): Promise<CardResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_fact", { p_fact_id: factId });
  if (error) return { ok: false, error: userMessage(error) };
  revalidatePath("/settings");
  return { ok: true };
}
