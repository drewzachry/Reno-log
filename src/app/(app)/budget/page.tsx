import Link from "next/link";
import { ui } from "@/components/ui";
import { getSession } from "@/lib/projects";
import { bucketStats, budgetTotals } from "@/lib/record/budget";
import { shortDate } from "@/lib/record/dates";
import { loadRecord } from "@/lib/record/load";
import { money } from "@/lib/record/money";
import { BUCKET_KIND_LABEL, BUCKET_KINDS, type LedgerEntry } from "@/lib/record/types";

export const metadata = { title: "Budget" };

const KIND_LABEL: Record<LedgerEntry["kind"], string> = {
  invoice: "Invoice",
  payment: "Payment",
  change_order: "Change order",
  credit: "Credit",
};

export default async function BudgetPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { buckets, ledger, decisions } = await loadRecord(supabase, current.id);
  const totals = budgetTotals(buckets, ledger, decisions);
  const name = (id: string | null) => buckets.find((b) => b.id === id)?.name ?? "—";

  return (
    <section>
      <h1 className={ui.h1}>Budget</h1>
      <p className="text-muted mb-2.5 max-w-[62ch]">
        Money is split the way your contract splits it. Allowances count your chosen items as spent
        the moment you pick them, so you see an overage before the invoice arrives.
      </p>

      <dl className="my-2 grid grid-cols-3 gap-2">
        {[
          [money(totals.total), "Total budget"],
          [money(totals.paid), "Paid so far"],
          ...(totals.cushionLeft != null ? [[money(totals.cushionLeft), "Cushion left"]] : []),
        ].map(([v, l]) => (
          <div key={l} className="border-ink border-t-2 pt-1.5">
            <dd className="font-mono text-base font-medium md:text-[19px]">{v}</dd>
            <dt className="text-muted text-[12.5px]">{l}</dt>
          </div>
        ))}
      </dl>

      {buckets.length === 0 && (
        <p className="border-line text-muted mt-3 rounded border border-dashed p-4 text-[13.5px]">
          No budget yet. Soon you’ll set it up from your contract: the contract price, each
          allowance, and a cushion for surprises.
        </p>
      )}

      {BUCKET_KINDS.map((kind) => {
        const list = buckets.filter((b) => b.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <h2 className="font-display text-muted mt-[18px] mb-1.5 text-[13px] font-bold tracking-[.07em] uppercase [font-stretch:95%]">
              {BUCKET_KIND_LABEL[kind]}
            </h2>
            <div className="grid gap-2.5">
              {list.map((b) => {
                const st = bucketStats(b, ledger, decisions);
                const over = st.left < 0;
                const pct = b.budget_cents ? Math.min(100, (st.used / b.budget_cents) * 100) : 0;
                return (
                  <article
                    key={b.id}
                    className="border-line bg-paper grid gap-1.5 rounded border px-3 py-2.5"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold">{b.name}</span>
                      <span className="font-mono">
                        {money(st.used)} / {money(b.budget_cents)}
                      </span>
                    </div>
                    <div
                      className="bg-bg relative h-2 overflow-hidden rounded"
                      role="meter"
                      aria-label={`${b.name} used`}
                      aria-valuemin={0}
                      aria-valuemax={b.budget_cents}
                      aria-valuenow={Math.min(st.used, b.budget_cents)}
                    >
                      <i
                        className={`absolute inset-y-0 left-0 rounded ${over ? "bg-bad" : "bg-accent"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-muted flex flex-wrap gap-x-3 text-[12.5px]">
                      <span>
                        Paid <span className="font-mono">{money(st.paid)}</span>
                      </span>
                      {st.changeOrders > 0 && (
                        <span>
                          Change orders <span className="font-mono">{money(st.changeOrders)}</span>
                        </span>
                      )}
                      {kind === "allowance" && (
                        <span>
                          Chosen <span className="font-mono">{money(st.chosen)}</span>
                        </span>
                      )}
                      <span className={over ? "text-bad font-medium" : ""}>
                        {over ? "Over by " : "Left "}
                        <span className="font-mono">{money(Math.abs(st.left))}</span>
                      </span>
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}

      <h2 className="font-display text-muted mt-[18px] mb-1.5 flex justify-between text-[13px] font-bold tracking-[.07em] uppercase [font-stretch:95%]">
        <span>Invoices, payments and change orders</span>
        <span className="font-mono">{ledger.length}</span>
      </h2>
      {ledger.length === 0 ? (
        <p className="border-line text-muted rounded border border-dashed p-4 text-[13.5px]">
          No invoices yet. Soon you’ll snap a photo of one in the chat.
        </p>
      ) : (
        <ul className="divide-line divide-y text-[13.5px]">
          {ledger.map((l) => (
            <li
              key={l.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 py-2.5"
            >
              <span className="text-muted text-[12.5px]">
                <span className="font-mono">{shortDate(l.date)}</span> · {KIND_LABEL[l.kind]}
                {l.change_order_status && l.change_order_status !== "approved" && (
                  <span className="border-line bg-warn-soft text-ink ml-1.5 rounded-full border px-2 py-px text-[11.5px]">
                    {l.change_order_status === "proposed" ? "Not approved yet" : "Rejected"}
                  </span>
                )}
              </span>
              <span className="row-span-2 self-center text-right font-mono text-[15px]">
                {l.kind === "credit" ? "−" : ""}
                {money(l.amount_cents)}
              </span>
              <span className="font-semibold">{l.vendor}</span>
              {l.description && <span className="col-span-2">{l.description}</span>}
              <span className="text-muted col-span-2 text-[12.5px]">{name(l.bucket_id)}</span>
              {l.flags.length > 0 && (
                <span className="col-span-2 flex flex-wrap gap-1">
                  {l.flags.map((f) => (
                    <span key={f} className="bg-warn-soft rounded-full px-2 py-px text-[11.5px]">
                      {f}
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted mt-4 text-[12.5px]">
        Proposed change orders don’t count until approved.{" "}
        <Link href="/history" className="text-accent">
          See every change
        </Link>
        .
      </p>
    </section>
  );
}
