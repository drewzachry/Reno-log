"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { kickJobs } from "@/lib/documents/jobs";
import { userMessage } from "@/lib/errors";
import { siteOrigin } from "@/lib/origin";
import { parseMoney } from "@/lib/record/money";
import { answersSchema } from "@/lib/setup/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SetupFormState = { error?: string; values?: Record<string, string> };

const field = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

/** "Build my decision map": checks the answers and starts drafting. */
export async function buildPlan(_: SetupFormState, form: FormData): Promise<SetupFormState> {
  const values = Object.fromEntries(
    ["scope", "start_date", "move_in", "contract", "cushion", "allowances"].map((k) => [
      k,
      field(form, k),
    ]),
  );
  const money = (k: string) => (values[k] ? parseMoney(values[k]) : null);
  if (values.contract && money("contract") == null)
    return { error: "The contract price should be an amount, like 285,000.", values };
  if (values.cushion && money("cushion") == null)
    return { error: "The cushion should be an amount, like 25,000.", values };
  if (values.move_in && values.start_date && values.move_in <= values.start_date)
    return { error: "Move-in should be after the start date.", values };
  const answers = answersSchema.safeParse({
    scope: values.scope,
    start_date: values.start_date,
    move_in: values.move_in || null,
    contract_cents: money("contract"),
    cushion_cents: money("cushion"),
    allowances: values.allowances,
  });
  if (!answers.success)
    return {
      error: !values.scope ? "Say what you’re renovating." : "Add a start date.",
      values,
    };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_setup", {
    p_project_id: field(form, "projectId"),
    p_answers: answers.data,
  });
  if (error) return { error: userMessage(error), values };
  const origin = await siteOrigin();
  after(() => kickJobs(origin));
  revalidatePath("/plan");
  return {};
}

/** "Change my answers": sets the draft aside. */
export async function discardPlan(planId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_setup", { p_plan_id: planId });
  if (error) return { error: userMessage(error) };
  revalidatePath("/plan");
  return {};
}

/** "Save to my project": adds the plan, says so in the chat, and opens Decisions. */
export async function savePlan(planId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("setup_plans")
    .select("project_id")
    .eq("id", planId)
    .maybeSingle();
  const { data, error } = await supabase.rpc("apply_setup", { p_plan_id: planId });
  if (error || !plan) return { error: userMessage(error) };
  const added = data as { decisions: number; buckets: number; dates: number; skipped: number };
  const { count: docs } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", plan.project_id)
    .eq("status", "ready")
    .is("deleted_at", null);
  const text =
    `Your decision map is ready: ${added.decisions} decision${added.decisions === 1 ? "" : "s"} added, each with a deadline worked back from your schedule.` +
    (added.skipped ? ` ${added.skipped} you already had stay as they were.` : "") +
    (docs
      ? " I used your documents to match it to your plans, and you can ask me anything about them."
      : "") +
    " The dates are estimates until your contractor confirms them. When you get real dates, tell me and I’ll move everything that depends on them.";
  await createAdminClient()
    ?.from("messages")
    .insert({ project_id: plan.project_id, role: "assistant", text });
  revalidatePath("/", "layout");
  redirect("/decisions");
}
