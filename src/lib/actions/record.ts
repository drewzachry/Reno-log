"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoney } from "@/lib/record/money";
import { getSession } from "@/lib/projects";
import { applyProposal, type ApplyResult } from "./applyProposal";
import { selectProject } from "./projects";
import { userMessage } from "@/lib/errors";

function refresh() {
  revalidatePath("/", "layout");
}

export async function setDecisionStatus(decisionId: string, status: string): Promise<ApplyResult> {
  const r = await applyProposal({ type: "update_decision", decision_id: decisionId, status });
  refresh();
  return r;
}

export type DecisionFormState = { error?: string; saved?: boolean };

export async function saveDecision(
  _: DecisionFormState,
  form: FormData,
): Promise<DecisionFormState> {
  const costText = String(form.get("cost") ?? "").trim();
  const cost = costText === "" ? null : parseMoney(costText);
  if (costText !== "" && cost == null) return { error: "Enter the cost as a number, like 3,900." };
  const bucket = String(form.get("bucket") ?? "");
  const r = await applyProposal({
    type: "update_decision",
    decision_id: form.get("decisionId"),
    status: form.get("status") || undefined,
    selection: String(form.get("selection") ?? "").trim() || null,
    cost_cents: cost,
    bucket_id: bucket || null,
    reason: String(form.get("reason") ?? "").trim() || undefined,
  });
  refresh();
  return r.ok ? { saved: true } : { error: r.error };
}

export type MoveState = { error?: string; result?: ApplyResult & { ok: true } };

export async function moveMilestone(_: MoveState, form: FormData): Promise<MoveState> {
  const { current } = await getSession();
  if (!current) return { error: "Please sign in first." };
  const r = await applyProposal({
    type: "move_milestone",
    project_id: current.id,
    milestone_key: form.get("key"),
    date: form.get("date"),
    reason: String(form.get("reason") ?? "").trim() || undefined,
  });
  refresh();
  return r.ok ? { result: r } : { error: r.error };
}

export async function loadSampleProject() {
  const { supabase } = await getSession();
  const { data, error } = await supabase.rpc("load_sample_project");
  if (error) throw new Error(userMessage(error));
  await selectProject(data as string);
  redirect("/decisions");
}

export type FundingState = { error?: string; saved?: number };

/** Adds an account (no id) or changes one. */
export async function saveFunding(_: FundingState, form: FormData): Promise<FundingState> {
  const { current } = await getSession();
  if (!current) return { error: "Please sign in first." };
  const amount = parseMoney(String(form.get("amount") ?? ""));
  if (amount == null) return { error: "Enter the amount as a number, like 90,000." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the account a name, like Savings." };
  const r = await applyProposal({
    type: "save_funding_source",
    project_id: current.id,
    id: String(form.get("id") ?? "") || null,
    name,
    amount_cents: amount,
  });
  refresh();
  return r.ok ? { saved: Date.now() } : { error: r.error };
}

export async function removeFunding(id: string): Promise<ApplyResult> {
  const { current } = await getSession();
  if (!current) return { ok: false, error: "Please sign in first." };
  const r = await applyProposal({ type: "remove_funding_source", project_id: current.id, id });
  refresh();
  return r;
}
