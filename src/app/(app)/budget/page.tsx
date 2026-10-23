import { EmptyState, PageHeader, Pill, SectionTitle } from "@/components/page";
import { getSession } from "@/lib/projects";
import {
  bucketStats,
  budgetTotals,
  bufferSummary,
  proposedChangeOrders,
  unlinked,
} from "@/lib/record/budget";
import { shortDate } from "@/lib/record/dates";
import { loadRecord } from "@/lib/record/load";
import { money } from "@/lib/record/money";
import { BUCKET_KIND_LABEL, BUCKET_KINDS, type Bucket, type LedgerEntry } from "@/lib/record/types";
import { can } from "@/lib/roles";
import { FundingList } from "./FundingList";
import { MarkPaid } from "./MarkPaid";

export const metadata = { title: "Budget" };

const KIND_LABEL: Record<LedgerEntry["kind"], string> = {
  invoice: "Invoice",
  payment: "Payment",
  change_order: "Change order",
  credit: "Credit",
};

/** A dash for nothing, as on the dashboard. */
const amount = (cents: number) => (cents === 0 ? "—" : money(cents));

function Tile({ value, label, tone = "" }: { value: string; label: string; tone?: string }) {
  return (
    <div className="border-line bg-paper rounded-[10px] border px-1.5 py-3 text-center">
      <dd className={`text-[15px] font-bold tabular-nums ${tone}`}>{value}</dd>
      <dt className="text-muted mt-0.5 text-[10px] tracking-[.5px] uppercase">{label}</dt>
    </div>
  );
}

function Figure({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dd className={`text-[12px] font-bold tabular-nums ${tone}`}>{value}</dd>
      <dt className="text-muted mt-0.5 text-[9px] tracking-[.5px] uppercase">{label}</dt>
    </div>
  );
}

/** What is and isn't in a line's "still to pay", in a few plain words. */
function lineNotes(b: Bucket, st: ReturnType<typeof bucketStats>) {
  const notes: string[] = [];
  if (b.kind === "contingency") {
    notes.push("Kept in reserve and counted in full as money you may still need.");
    if (st.changeOrders > 0)
      notes.push(`${money(st.changeOrders)} spent on approved change orders.`);
  } else {
    if (st.changeOrders > 0)
      notes.push(`Includes ${money(st.changeOrders)} in approved change orders.`);
    if (st.reserved > 0)
      notes.push(
        b.kind === "allowance"
          ? `Includes ${money(st.reserved)} set aside for items not picked yet.`
          : `Includes ${money(st.reserved)} for work not billed yet.`,
      );
  }
  if (st.unpaid > 0) notes.push(`${money(st.unpaid)} billed but not paid yet.`);
  return notes;
}

export default async function BudgetPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { buckets, ledger, decisions, sources } = await loadRecord(supabase, current.id);
  const editor = can.edit(current.role);
  const totals = budgetTotals(buckets, ledger, decisions);
  const buf = bufferSummary(sources, buckets, ledger, decisions);
  const proposed = proposedChangeOrders(ledger);
  const loose = unlinked(buckets, ledger);
  const short = buf.buffer < 0;
  const name = (id: string | null) => buckets.find((b) => b.id === id)?.name ?? "No budget line";
  const lines = buckets.map((b) => ({ b, st: bucketStats(b, ledger, decisions) }));
  const cushion = lines.find((l) => l.b.kind === "contingency");

  return (
    <section>
      <PageHeader title="Budget" />

      {/* Overview, as on the dashboard's Budget tab. */}
      <div className="bg-header text-header-ink mb-4 rounded-xl p-4">
        {sources.length > 0 && (
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-header-muted text-[13px]">Total available</span>
            <span className="text-[15px] font-bold tabular-nums">{money(buf.funds)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-header-muted text-[13px]">Total still to pay</span>
          <span className="text-[15px] font-bold tabular-nums">{money(buf.toPay)}</span>
        </div>
        {sources.length > 0 ? (
          <>
            <div className="bg-header-muted my-2.5 h-px" />
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold">
                {short ? "Shortfall" : "Buffer (surplus)"}
              </span>
              <span
                className={`text-[18px] font-bold tabular-nums ${short ? "text-[#fca5a5]" : "text-[#86efac]"}`}
              >
                {short ? "−" : "+"}
                {money(Math.abs(buf.buffer))}
              </span>
            </div>
          </>
        ) : (
          <p className="text-header-muted mt-2.5 text-[12px] leading-snug">
            Add the accounts below to see your buffer: what’s available less what’s still to pay.
          </p>
        )}
        {cushion && cushion.st.remaining > 0 && (
          <p className="text-header-muted mt-2.5 text-[11px] leading-snug">
            Still to pay includes the {money(cushion.st.remaining)} cushion, kept in full.
          </p>
        )}
      </div>

      <dl
        className={`mb-4 grid gap-2.5 ${2 + (totals.unpaid > 0 ? 1 : 0) + (totals.cushionLeft != null ? 1 : 0) === 4 ? "grid-cols-2" : "grid-cols-3"}`}
      >
        <Tile value={money(totals.total)} label="Total budget" />
        <Tile value={money(totals.paid)} label="Paid so far" tone="text-ok" />
        {totals.unpaid > 0 && (
          <Tile value={money(totals.unpaid)} label="Billed, not paid" tone="text-warn" />
        )}
        {totals.cushionLeft != null && (
          <Tile value={money(totals.cushionLeft)} label="Cushion left" />
        )}
      </dl>

      {(proposed.count > 0 || loose.count > 0) && (
        <div className="bg-warn-soft text-warn mb-4 grid gap-1 rounded-[10px] p-3 text-[12.5px] leading-snug">
          {proposed.count > 0 && (
            <p>
              ⚠ Not counted yet: {proposed.count} change order{proposed.count === 1 ? "" : "s"}{" "}
              waiting for approval ({money(proposed.total)}). They count once approved.
            </p>
          )}
          {loose.count > 0 && (
            <p>
              ⚠ {loose.count} invoice{loose.count === 1 ? "" : "s"} or payment
              {loose.count === 1 ? "" : "s"} ({money(loose.paid + loose.unpaid)}) not linked to a
              budget line, so no line counts {loose.count === 1 ? "it" : "them"}.
            </p>
          )}
        </div>
      )}

      {lines.length > 0 && (
        <details className="border-line bg-paper mb-1 rounded-[10px] border">
          <summary className="min-h-11 cursor-pointer px-3.5 py-3 text-[13px] font-semibold">
            How this adds up
          </summary>
          <div className="border-line border-t px-3.5 py-2.5 text-[13px]">
            <p className="text-muted mb-2 text-[12px] leading-snug">
              Still to pay on each line is what the line will cost, less what’s been paid. The lines
              add up to the total above. Buffer is what’s available less that total.
            </p>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
              {lines.map(({ b, st }) => (
                <div key={b.id} className="contents">
                  <dt className="truncate">{b.name}</dt>
                  <dd className="text-right tabular-nums">{money(st.remaining)}</dd>
                </div>
              ))}
              <dt className="border-line border-t pt-1 font-bold">Total still to pay</dt>
              <dd className="border-line border-t pt-1 text-right font-bold tabular-nums">
                {money(buf.toPay)}
              </dd>
              {sources.length > 0 && (
                <>
                  <dt>Total available</dt>
                  <dd className="text-right tabular-nums">{money(buf.funds)}</dd>
                  <dt className="font-bold">{short ? "Shortfall" : "Buffer"}</dt>
                  <dd className="text-right font-bold tabular-nums">
                    {short ? "−" : ""}
                    {money(Math.abs(buf.buffer))}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </details>
      )}

      <section aria-labelledby="funding">
        <SectionTitle id="funding">Money for the project</SectionTitle>
        <p className="text-muted -mt-1 mb-2 text-[13px]">
          Where the money comes from. Enter what’s available now, after what you’ve already paid.
          Names and amounts only; nothing is linked to your bank.
        </p>
        <FundingList sources={sources} canEdit={editor} />
      </section>

      {buckets.length === 0 && (
        <div className="mt-6">
          <EmptyState>
            No budget lines yet. Set up your project to create them from your contract: the price,
            each allowance and a cushion for surprises.
          </EmptyState>
        </div>
      )}

      {BUCKET_KINDS.map((kind) => {
        const list = lines.filter((l) => l.b.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <SectionTitle>{BUCKET_KIND_LABEL[kind]}</SectionTitle>
            <div className="grid gap-2">
              {list.map(({ b, st }) => {
                const over = st.left < 0;
                const notes = lineNotes(b, st);
                return (
                  <article key={b.id} className="border-line bg-paper rounded-[10px] border p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[13px] leading-snug font-semibold">{b.name}</h3>
                      {over && <Pill tone="bad">Over by {money(-st.left)}</Pill>}
                    </div>
                    {notes.map((n) => (
                      <p key={n} className="text-muted mt-1 text-[11px] leading-snug">
                        {n}
                      </p>
                    ))}
                    <dl className="mt-2.5 grid grid-cols-4 gap-1 text-center">
                      <Figure label="Budget" value={amount(st.allowed)} />
                      <Figure
                        label="Actual"
                        value={amount(st.used)}
                        tone={over ? "text-bad" : ""}
                      />
                      <Figure label="Paid" value={amount(st.paid)} tone="text-ok" />
                      <Figure label="Still to pay" value={amount(st.remaining)} tone="text-warn" />
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}

      <SectionTitle count={ledger.length || undefined}>Invoices and payments</SectionTitle>
      {ledger.length === 0 ? (
        <EmptyState>No invoices yet. Snap a photo of one in the chat.</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {ledger.map((l) => {
            const unpaid = l.kind === "invoice" && l.unpaid;
            const tag =
              l.kind === "change_order"
                ? l.change_order_status === "approved"
                  ? { text: "📦 Approved", cls: "text-info", edge: "border-l-info" }
                  : l.change_order_status === "rejected"
                    ? { text: "❌ Rejected", cls: "text-muted", edge: "border-l-line" }
                    : { text: "🟡 Not approved yet", cls: "text-warn", edge: "border-l-pending" }
                : unpaid
                  ? { text: "🟡 Not paid yet", cls: "text-warn", edge: "border-l-pending" }
                  : { text: "✅ Paid", cls: "text-ok", edge: "border-l-ok" };
            return (
              <li
                key={l.id}
                className={`border-line bg-paper rounded-[10px] border border-l-[3px] p-3.5 ${tag.edge}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] leading-snug font-semibold">{l.vendor}</span>
                  <span className="text-[14px] font-bold whitespace-nowrap tabular-nums">
                    {l.kind === "credit" ? "−" : ""}
                    {money(l.amount_cents)}
                  </span>
                </div>
                {l.description && (
                  <p className="mt-0.5 text-[13px] leading-snug">{l.description}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-muted text-[12px]">
                    {shortDate(l.date)} · {KIND_LABEL[l.kind]} · {name(l.bucket_id)}
                  </span>
                  <span className={`text-[10px] font-bold whitespace-nowrap ${tag.cls}`}>
                    {tag.text}
                  </span>
                </div>
                {l.flags.length === 1 && l.flags[0].length <= 40 && (
                  <div className="mt-1.5">
                    <Pill tone="warn">{l.flags[0]}</Pill>
                  </div>
                )}
                {(l.flags.length > 1 || (l.flags[0]?.length ?? 0) > 40) && (
                  <details className="mt-1">
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
                {editor && l.kind === "invoice" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <MarkPaid id={l.id} paid={!l.unpaid} vendor={l.vendor} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
