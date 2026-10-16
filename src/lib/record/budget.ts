import { CHOSEN, type Bucket, type Decision, type LedgerEntry } from "./types";

export type BucketStats = {
  /** Invoices and payments, less credits. */
  paid: number;
  /** Approved change orders charged to this bucket. */
  changeOrders: number;
  /** Cost of items already chosen (decided or further) linked to this bucket. */
  chosen: number;
  /** What counts against the budget. */
  used: number;
  left: number;
};

/**
 * Budget math, in cents. Allowances count chosen items the moment they are
 * picked, so an overage shows before the invoice arrives: their "used" is the
 * larger of money out and chosen cost. Other buckets count money out only.
 * Proposed or rejected change orders don't count.
 */
export function bucketStats(b: Bucket, ledger: LedgerEntry[], decisions: Decision[]): BucketStats {
  const mine = ledger.filter((l) => l.bucket_id === b.id);
  const paid = mine.reduce(
    (a, l) =>
      l.kind === "invoice" || l.kind === "payment"
        ? a + l.amount_cents
        : l.kind === "credit"
          ? a - l.amount_cents
          : a,
    0,
  );
  const changeOrders = mine
    .filter((l) => l.kind === "change_order" && l.change_order_status === "approved")
    .reduce((a, l) => a + l.amount_cents, 0);
  const chosen = decisions
    .filter((d) => d.bucket_id === b.id && CHOSEN.has(d.status))
    .reduce((a, d) => a + (d.cost_cents ?? 0), 0);
  const committed = paid + changeOrders;
  const used = b.kind === "allowance" ? Math.max(committed, chosen) : committed;
  return { paid, changeOrders, chosen, used, left: b.budget_cents - used };
}

export function budgetTotals(buckets: Bucket[], ledger: LedgerEntry[], decisions: Decision[]) {
  const total = buckets.reduce((a, b) => a + b.budget_cents, 0);
  const paid = ledger.reduce(
    (a, l) =>
      l.kind === "invoice" || l.kind === "payment"
        ? a + l.amount_cents
        : l.kind === "credit"
          ? a - l.amount_cents
          : a,
    0,
  );
  const cushion = buckets.find((b) => b.kind === "contingency");
  return {
    total,
    paid,
    cushionLeft: cushion ? bucketStats(cushion, ledger, decisions).left : null,
  };
}
