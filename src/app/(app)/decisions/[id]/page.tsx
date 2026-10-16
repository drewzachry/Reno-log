import Link from "next/link";
import { notFound } from "next/navigation";
import { EventList, type EventRow } from "@/components/record/EventList";
import { ui } from "@/components/ui";
import { getSession } from "@/lib/projects";
import { shortDate } from "@/lib/record/dates";
import { loadRecord, viewerTimeZone } from "@/lib/record/load";
import { money } from "@/lib/record/money";
import { OPEN, STATUS_LABEL } from "@/lib/record/types";
import { can } from "@/lib/roles";
import { DecisionForm } from "./DecisionForm";

export const metadata = { title: "Decision" };

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { decisions, milestones, buckets } = await loadRecord(supabase, current.id);
  const d = decisions.find((x) => x.id === id);
  if (!d) notFound();

  const { data: events } = await supabase
    .from("events")
    .select(
      "id, summary, created_at, before, after, reason, actor:profiles!events_actor_id_fkey(display_name, email)",
    )
    .eq("project_id", current.id)
    .eq("entity_id", d.id)
    .order("created_at", { ascending: false })
    .returns<EventRow[]>();

  const milestone = milestones.find((m) => m.key === d.milestone_key);
  const bucket = buckets.find((b) => b.id === d.bucket_id);
  const open = OPEN.has(d.status);
  const n = d.daysLeft;

  return (
    <article className="grid max-w-xl gap-5">
      <div>
        <Link href="/decisions" className="text-accent text-sm">
          ← All decisions
        </Link>
        <p className={`${ui.eyebrow} mt-3`}>
          {d.room}
          {d.category ? ` · ${d.category}` : ""}
        </p>
        <h1 className={ui.h1}>{d.title}</h1>
        {d.why && <p className="text-muted mt-1">{d.why}</p>}
      </div>

      <dl className="border-line bg-paper grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded border p-3 text-[14px]">
        <dt className="text-muted">Status</dt>
        <dd>{STATUS_LABEL[d.status]}</dd>
        <dt className="text-muted">Decide by</dt>
        <dd
          className={`font-mono ${open && n != null && n < 0 ? "text-bad" : open && n != null && n <= 14 ? "text-warn" : ""}`}
        >
          {d.decideBy
            ? `${shortDate(d.decideBy)}${open && n != null ? (n < 0 ? ` · ${-n}d late` : ` · in ${n}d`) : ""}`
            : "Once the schedule has dates"}
        </dd>
        <dt className="text-muted">Why then</dt>
        <dd>
          {d.lead_weeks > 0 ? `${d.lead_weeks} weeks before ` : "Before "}
          {milestone?.label.toLowerCase() ?? d.milestone_key}
          {milestone?.date ? ` (${shortDate(milestone.date)})` : ""}
        </dd>
        {d.selection && (
          <>
            <dt className="text-muted">Picked</dt>
            <dd>
              {d.selection}
              {d.cost_cents != null && <span className="font-mono"> · {money(d.cost_cents)}</span>}
            </dd>
          </>
        )}
        {bucket && (
          <>
            <dt className="text-muted">Paid from</dt>
            <dd>
              <Link href="/budget" className="text-accent">
                {bucket.name}
              </Link>
            </dd>
          </>
        )}
        {d.source && (
          <>
            <dt className="text-muted">Source</dt>
            <dd>{d.source}</dd>
          </>
        )}
      </dl>

      {can.edit(current.role) && (
        <section className="grid gap-3">
          <h2 className="font-display text-lg font-extrabold">Update</h2>
          <DecisionForm
            id={d.id}
            status={d.status}
            selection={d.selection}
            costCents={d.cost_cents}
            bucketId={d.bucket_id}
            buckets={buckets}
          />
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-extrabold">History</h2>
        {events?.length ? (
          <EventList
            events={events}
            bucketName={(bid) => buckets.find((b) => b.id === bid)?.name}
            timeZone={await viewerTimeZone()}
          />
        ) : (
          <p className="text-muted text-sm">No changes yet.</p>
        )}
      </section>
    </article>
  );
}
