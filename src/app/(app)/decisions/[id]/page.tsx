import Link from "next/link";
import { notFound } from "next/navigation";
import { EventList, type EventRow } from "@/components/record/EventList";
import { PageHeader, Pill, SectionTitle } from "@/components/page";
import { urgency } from "@/components/record/DecisionCard";
import { getSession } from "@/lib/projects";
import { daysText, shortDate } from "@/lib/record/dates";
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
  const u = urgency(d);

  return (
    <article className="grid gap-4">
      <div>
        <Link
          href="/decisions"
          className="text-accent inline-flex min-h-9 items-center text-[14px]"
        >
          ← All decisions
        </Link>
        <PageHeader
          eyebrow={[d.room, d.category].filter(Boolean).join(" · ")}
          title={d.title}
          lede={d.why ?? undefined}
        >
          <p className="mt-2 flex flex-wrap gap-2">
            <Pill tone={open ? "neutral" : "ok"}>{STATUS_LABEL[d.status]}</Pill>
            {u === "late" && <Pill tone="bad">{daysText(n!)}</Pill>}
            {u === "soon" && <Pill tone="warn">Due {daysText(n!).toLowerCase()}</Pill>}
          </p>
        </PageHeader>
      </div>

      <dl className="border-line bg-paper grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded border p-3 text-[14px]">
        <dt className="text-muted">Decide by</dt>
        <dd>
          {d.decideBy
            ? `${shortDate(d.decideBy)}${open && n != null ? ` (${daysText(n).toLowerCase()})` : ""}`
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
              {d.cost_cents != null && (
                <span className="tabular-nums"> · {money(d.cost_cents)}</span>
              )}
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
        <section className="border-line bg-paper rounded border p-3">
          <SectionTitle as="h2">Update this decision</SectionTitle>
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
        <SectionTitle>History</SectionTitle>
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
