import Link from "next/link";
import { EmptyState, PageHeader, Pill, SectionTitle } from "@/components/page";
import { getSession } from "@/lib/projects";
import { shortDate } from "@/lib/record/dates";
import { loadRecord } from "@/lib/record/load";
import { money } from "@/lib/record/money";
import { BUCKET_KIND_LABEL } from "@/lib/record/types";
import { can } from "@/lib/roles";
import { planSchema, previewPlan, STAGES } from "@/lib/setup/plan";
import { AddDocuments } from "../documents/AddDocuments";
import { DocumentStatus } from "../documents/DocumentStatus";
import { PlanActions } from "./PlanActions";
import { PlanForm } from "./PlanForm";

export const metadata = { title: "Set up your project" };

type Details = {
  contract_price_cents?: number | null;
  allowances?: { name: string; amount_cents: number }[];
  start_date?: string | null;
  completion_date?: string | null;
};
type DocRow = {
  id: string;
  title: string;
  status: "reading" | "ready" | "failed";
  progress: string | null;
  updated_at: string;
  details: Details | null;
};
type PlanRow = {
  id: string;
  status: "building" | "ready" | "failed" | "applied" | "discarded";
  answers: Record<string, unknown>;
  plan: unknown;
  progress: string | null;
  error: string | null;
  updated_at: string;
};

const dollars = (c: number | null | undefined) =>
  c == null ? "" : Math.round(c / 100).toLocaleString("en-US");

export default async function PlanPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  if (!can.edit(current.role))
    return (
      <section>
        <PageHeader title="Set up your project" />
        <EmptyState>Only the project’s owner and editors can set it up.</EmptyState>
      </section>
    );

  const [record, project, docs, plans] = await Promise.all([
    loadRecord(supabase, current.id),
    supabase
      .from("projects")
      .select("scope, start_date, target_move_in")
      .eq("id", current.id)
      .single(),
    supabase
      .from("documents")
      .select("id, title, status, progress, updated_at, details")
      .eq("project_id", current.id)
      .is("deleted_at", null)
      .order("created_at")
      .returns<DocRow[]>(),
    supabase
      .from("setup_plans")
      .select("id, status, answers, plan, progress, error, updated_at")
      .eq("project_id", current.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<PlanRow[]>(),
  ]);
  const latest = plans.data?.[0] ?? null;
  const documents = docs.data ?? [];

  // Building: show progress and keep it moving.
  if (latest?.status === "building")
    return (
      <section>
        <PageHeader
          title="Building your decision map"
          lede="This takes a minute or two. You can leave this screen; it carries on."
        />
        <DocumentStatus reading={[latest.updated_at]} />
        <p className="border-line bg-paper text-muted animate-pulse rounded border p-3 text-[14px]">
          {latest.progress ?? "Starting…"}
        </p>
      </section>
    );

  // Ready: the preview, then save or go back.
  const parsed = latest?.status === "ready" ? planSchema.safeParse(latest.plan) : null;
  if (latest && parsed?.success) {
    const v = previewPlan(parsed.data, record);
    const label = (k: string) => record.milestones.find((m) => m.key === k)?.label ?? k;
    return (
      <section className="pb-28">
        <PageHeader
          eyebrow="Preview"
          title="Your decision map"
          lede="Nothing is saved yet. Look it over, then save it to your project, or go back and change your answers."
        />
        <p className="border-line bg-paper rounded border p-3 text-[15px]">
          <b>{v.counts.decisions}</b> decision{v.counts.decisions === 1 ? "" : "s"}
          {v.counts.decided > 0 && ` (${v.counts.decided} already decided in your documents)`},{" "}
          <b>{v.counts.buckets}</b> budget line{v.counts.buckets === 1 ? "" : "s"},{" "}
          <b>{v.counts.dates}</b> date{v.counts.dates === 1 ? "" : "s"}.
          {v.skipped > 0 && (
            <span className="text-muted block text-[13.5px]">
              {v.skipped} you already have stay as they are.
            </span>
          )}
        </p>

        <SectionTitle>Dates</SectionTitle>
        <ul className="border-line bg-paper divide-line divide-y rounded border text-[14px]">
          {v.dates.map((d) => (
            <li key={d.key} className="flex items-baseline gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">{d.label}</span>
              {d.kept ? (
                <span className="text-muted text-right">
                  {shortDate(d.kept)} <span className="text-[12.5px]">(yours, kept)</span>
                </span>
              ) : (
                <span className="font-semibold tabular-nums">{shortDate(d.planned)}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-muted mt-1 text-[12.5px]">
          Estimates until your contractor confirms them.
        </p>

        {v.buckets.length > 0 && (
          <>
            <SectionTitle>Budget lines</SectionTitle>
            <ul className="border-line bg-paper divide-line divide-y rounded border text-[14px]">
              {v.buckets.map((b) => (
                <li key={b.key} className="flex items-baseline gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    {b.name}
                    <span className="text-muted block text-[12.5px]">
                      {BUCKET_KIND_LABEL[b.kind]}
                      {b.exists && " · already there, kept"}
                    </span>
                  </span>
                  <span className={`tabular-nums ${b.exists ? "text-muted" : "font-semibold"}`}>
                    {money(b.budget_cents)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <SectionTitle count={v.add.length}>Decisions</SectionTitle>
        <div className="grid gap-2">
          {STAGES.map((k, i) => {
            const items = v.add.filter((d) => d.milestone_key === k);
            if (!items.length) return null;
            return (
              <details key={k} open={i === 0} className="border-line bg-paper rounded border">
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-semibold">
                  <span className="flex-1">Before {label(k).toLowerCase()}</span>
                  <span className="text-muted text-[13px] tabular-nums">{items.length}</span>
                </summary>
                <ul className="divide-line border-line divide-y border-t text-[14px]">
                  {items.map((d) => (
                    <li key={`${d.title}|${d.room}`} className="px-3 py-2">
                      <span className="font-medium">{d.title}</span>{" "}
                      <span className="text-muted">({d.room})</span>
                      {d.status === "decided" ? (
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px]">
                          <Pill tone="ok">Decided</Pill>
                          <span>{d.selection}</span>
                          {d.source && <span className="text-muted">· {d.source}</span>}
                        </span>
                      ) : (
                        <span className="text-muted block text-[13px]">{d.why}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
        <PlanActions planId={latest.id} />
      </section>
    );
  }

  // Otherwise: documents, then the questions.
  const prev =
    latest && (latest.status === "failed" || latest.status === "discarded") ? latest.answers : null;
  const details = documents.filter((d) => d.status === "ready").map((d) => d.details ?? {});
  const fromDocs = <K extends keyof Details>(k: K) =>
    details.map((d) => d[k]).find((x) => x != null && (!Array.isArray(x) || x.length));
  const allowances = (fromDocs("allowances") as Details["allowances"]) ?? [];
  const p = project.data;
  const defaults = {
    scope: String(prev?.scope ?? p?.scope ?? ""),
    start_date: String(prev?.start_date ?? p?.start_date ?? fromDocs("start_date") ?? record.today),
    move_in: String(prev?.move_in ?? p?.target_move_in ?? fromDocs("completion_date") ?? ""),
    contract:
      prev?.contract_cents != null
        ? dollars(prev.contract_cents as number)
        : dollars(fromDocs("contract_price_cents") as number | undefined),
    cushion: prev?.cushion_cents != null ? dollars(prev.cushion_cents as number) : "",
    allowances: String(
      prev?.allowances ?? allowances.map((a) => `${a.name} $${dollars(a.amount_cents)}`).join(", "),
    ),
  };
  const reading = documents.filter((d) => d.status === "reading");

  return (
    <section>
      <PageHeader
        title="Set up your project"
        lede="Add your documents, then answer a few questions. The app builds your decision map: the choices your renovation needs, each with a deadline worked back from your schedule. You’ll see a preview before anything is saved."
      />
      {latest?.status === "failed" && (
        <p role="alert" className="bg-bad-soft mb-3 rounded p-3 text-[14px]">
          {latest.error ?? "The map couldn’t be built."} Your answers are below.
        </p>
      )}

      <SectionTitle>1. Your documents</SectionTitle>
      <p className="text-muted mb-2 text-[14px]">
        The contract, the architect’s plans, specs or estimates. They fill in the questions below
        and make the decisions match your actual plans. Optional, but worth it.
      </p>
      <DocumentStatus reading={reading.map((d) => d.updated_at)} />
      {documents.length > 0 && (
        <ul className="border-line bg-paper divide-line mb-3 divide-y rounded border text-[14px]">
          {documents.map((d) => (
            <li key={d.id} className="flex items-baseline gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{d.title}</span>
              <span
                className={`text-[12.5px] ${d.status === "failed" ? "text-bad" : d.status === "reading" ? "text-muted animate-pulse" : "text-ok"}`}
              >
                {d.status === "ready"
                  ? "Read ✓"
                  : d.status === "failed"
                    ? "Couldn’t read"
                    : (d.progress ?? "Reading…")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <AddDocuments projectId={current.id} />

      <SectionTitle>2. A few questions</SectionTitle>
      <PlanForm projectId={current.id} defaults={defaults} waiting={reading.length} />
      <p className="text-muted mt-4 text-[13px]">
        Already set up? This only adds what’s missing: your dates, budget lines and decisions stay
        as they are.{" "}
        <Link href="/decisions" className="text-accent">
          Back to Decisions
        </Link>
      </p>
    </section>
  );
}
