import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "./dates";
import { withDeadlines } from "./deadlines";
import type { Bucket, Decision, LedgerEntry, Milestone } from "./types";

export const TZ_COOKIE = "tz";

export async function viewerTimeZone() {
  return (await cookies()).get(TZ_COOKIE)?.value;
}

/** Today's date for the person looking, from the time zone their browser reported. */
export async function today() {
  return todayIn((await cookies()).get(TZ_COOKIE)?.value);
}

/** Everything the record screens need for one project, read under the caller's RLS. */
export async function loadRecord(supabase: SupabaseClient, projectId: string) {
  const [ms, ds, bs, ls] = await Promise.all([
    supabase
      .from("milestones")
      .select("id, key, label, explanation, date, sort_order")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("decisions")
      .select(
        "id, title, room, category, why, milestone_key, lead_weeks, due_date_override, status, selection, cost_cents, bucket_id, source",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null),
    supabase
      .from("budget_buckets")
      .select("id, name, kind, budget_cents, sort_order")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("ledger_entries")
      .select(
        "id, kind, date, vendor, description, amount_cents, bucket_id, flags, change_order_status",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("date", { ascending: false }),
  ]);

  // bigint columns arrive as numbers below 2^53, which covers any renovation.
  const milestones = (ms.data ?? []) as Milestone[];
  const decisions = (ds.data ?? []) as Decision[];
  const buckets = ((bs.data ?? []) as Bucket[]).map((b) => ({
    ...b,
    budget_cents: Number(b.budget_cents),
  }));
  const ledger = ((ls.data ?? []) as LedgerEntry[]).map((l) => ({
    ...l,
    amount_cents: Number(l.amount_cents),
  }));
  const t = await today();
  return {
    today: t,
    milestones,
    buckets,
    ledger,
    decisions: withDeadlines(
      decisions.map((d) => ({
        ...d,
        cost_cents: d.cost_cents == null ? null : Number(d.cost_cents),
      })),
      milestones,
      t,
    ),
  };
}
