import { EmptyState, PageHeader, Pill, SectionTitle } from "@/components/page";
import { getSession } from "@/lib/projects";
import { bucketStats, budgetTotals, bufferSummary } from "@/lib/record/budget";
import { shortDate } from "@/lib/record/dates";
import { loadRecord } from "@/lib/record/load";
import { money } from "@/lib/record/money";
import { BUCKET_KIND_LABEL, BUCKET_KINDS, type LedgerEntry } from "@/lib/record/types";
import { can } from "@/lib/roles";
import { FundingList } from "./FundingList";

export const metadata = { title: "Budget" };

const KIND_LABEL: Record<LedgerEntry["kind"], string> = {
  invoice: "Invoice",
  payment: "Payment",
  change_order: "Change order",
  credit: "Credit",
};

function Stat({ value, label, tone = "" }: { value: string; label: string; tone?: string }) {
  return (
    <div className="border-line bg-paper rounded border px-3 py-2.5">
      <dd className={`text-[19px] font-semibold tabular-nums ${tone}`}>{value}</dd>
      <dt className="text-muted text-[12.5px]">{label}</dt>
    </div>
  );
}

export default async function BudgetPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { buckets, ledger, decisions, sources } = await loadRecord(supabase, current.id);
  const totals = budgetTotals(buckets, ledger, decisions);
  const buf = bufferSummary(sources, buckets, ledger, decisions);
  const short = buf.buffer < 0;
  const name = (id: string | null) => buckets.find((b) => b.id === id)?.name ?? "Not linked";

  return (
    <section>
      <PageHeader
        title="Budget"
        lede="Split the way your contract splits it. Allowances count an item as spent the moment you pick it, so you see an overage before the invoice."
      />

      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat value={money(totals.total)} label="Total budget" />
        <Stat value={money(totals.paid)} label="Paid so far" />
        {totals.cushionLeft != null && (
          <Stat value={money(totals.cushionLeft)} label="Cushion left" />
        )}
        {sources.length > 0 && (
          <Stat
            value={money(Math.abs(buf.buffer))}
            label={short ? "Short by" : "Buffer"}
            tone={short ? "text-bad" : "text-ok"}
          />
        )}
      </dl>

      <section aria-labelledby="funding">
        <SectionTitle id="funding">Money for the project</SectionTitle>
        <p className="text-muted -mt-1 mb-2 text-[13px]">
          Where the money comes from. Names and amounts only; nothing is linked to your bank.
        </p>
        <FundingList sources={sources} canEdit={can.edit(current.role)} />
        {sources.length > 0 && (
          <div
            className={`mt-2 rounded px-3 py-2.5 text-[14px] ${short ? "bg-bad-soft" : "bg-ok-soft"}`}
          >
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5">
              <dt>Set aside</dt>
              <dd className="text-right tabular-nums">{money(buf.funds)}</dd>
              <dt>Still to pay</dt>
              <dd className="text-right tabular-nums">− {money(buf.toPay)}</dd>
              <dt className="border-ink/15 border-t pt-1 font-semibold">
                {short ? "Short by" : "Buffer"}
              </dt>
              <dd className="border-ink/15 border-t pt-1 text-right font-semibold tabular-nums">
                {money(Math.abs(buf.buffer))}
              </dd>
            </dl>
            <details className="text-muted mt-1.5 text-[13px]">
              <summary className="min-h-8 cursor-pointer">How is this worked out?</summary>
              Still to pay counts each budget line in full (or what it’s really costing, if that’s
              more), minus what’s been paid. The cushion counts too, so the buffer stays on the safe
              side.
            </details>
          </div>
        )}
      </section>

      {buckets.length === 0 && (
        <div className="mt-6">
          <EmptyState>
            No budget lines yet. Soon you’ll set them up from your contract: the price, each
            allowance and a cushion for surprises.
          </EmptyState>
        </div>
      )}

      {BUCKET_KINDS.map((kind) => {
        const list = buckets.filter((b) => b.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <SectionTitle>{BUCKET_KIND_LABEL[kind]}</SectionTitle>
            <div className="grid gap-2">
              {list.map((b) => {
                const st = bucketStats(b, ledger, decisions);
                const over = st.left < 0;
                const pct = b.budget_cents ? Math.min(100, (st.used / b.budget_cents) * 100) : 0;
                return (
                  <article
                    key={b.id}
                    className="border-line bg-paper grid gap-1.5 rounded border px-3 py-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{b.name}</span>
                      {over ? (
                        <Pill tone="bad">Over by {money(-st.left)}</Pill>
                      ) : (
                        <span className="text-muted text-[13.5px] tabular-nums">
                          {money(st.left)} left
                        </span>
                      )}
                    </div>
                    <div
                      className="bg-bg relative h-2 overflow-hidden rounded-full"
                      role="meter"
                      aria-label={`${b.name} used`}
                      aria-valuemin={0}
                      aria-valuemax={b.budget_cents}
                      aria-valuenow={Math.min(st.used, b.budget_cents)}
                    >
                      <i
                        className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-bad" : "bg-accent"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-muted flex flex-wrap gap-x-3 text-[13px]">
                      <span className="tabular-nums">
                        <b className="text-ink font-semibold">{money(st.used)}</b> of{" "}
                        {money(b.budget_cents)}
                      </span>
                      {kind === "allowance" && st.chosen > 0 && (
                        <span className="tabular-nums">{money(st.chosen)} chosen</span>
                      )}
                      {st.paid > 0 && st.paid !== st.used && (
                        <span className="tabular-nums">{money(st.paid)} paid</span>
                      )}
                      {st.changeOrders > 0 && (
                        <span className="tabular-nums">
                          {money(st.changeOrders)} in change orders
                        </span>
                      )}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}

      <SectionTitle count={ledger.length || undefined}>Invoices and payments</SectionTitle>
      {ledger.length === 0 ? (
        <EmptyState>No invoices yet. Soon you’ll snap a photo of one in the chat.</EmptyState>
      ) : (
        <ul className="divide-line border-line bg-paper divide-y rounded border text-[14px]">
          {ledger.map((l) => (
            <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2.5">
              <span className="font-semibold">{l.vendor}</span>
              <span className="text-right font-semibold tabular-nums">
                {l.kind === "credit" ? "−" : ""}
                {money(l.amount_cents)}
              </span>
              {l.description && <span className="col-span-2">{l.description}</span>}
              <span className="text-muted col-span-2 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                <span>
                  {shortDate(l.date)} · {KIND_LABEL[l.kind]} · {name(l.bucket_id)}
                </span>
                {l.change_order_status === "proposed" && <Pill tone="warn">Not approved yet</Pill>}
                {l.change_order_status === "rejected" && <Pill>Rejected</Pill>}
                {l.flags.length === 1 && l.flags[0].length <= 40 && (
                  <Pill tone="warn">{l.flags[0]}</Pill>
                )}
              </span>
              {(l.flags.length > 1 || (l.flags[0]?.length ?? 0) > 40) && (
                <details className="col-span-2 mt-1">
                  <summary className="text-warn min-h-8 cursor-pointer text-[13px] font-semibold">
                    {l.flags.length === 1
                      ? "1 thing to check"
                      : `${l.flags.length} things to check`}
                  </summary>
                  <ul className="mt-1 grid list-disc gap-1 pl-5 text-[13px]">
                    {l.flags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {ledger.some((l) => l.change_order_status === "proposed") && (
        <p className="text-muted mt-2 text-[12.5px]">Change orders count once they’re approved.</p>
      )}
    </section>
  );
}
