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
