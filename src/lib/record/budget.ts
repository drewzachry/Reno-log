import { CHOSEN, type Bucket, type Decision, type FundingSource, type LedgerEntry } from "./types";

/**
 * Budget math, in cents, worked the way the project dashboard works it:
 * every budget line has a Budget, an Actual (what it has cost or is
 * committed to cost), what's been Paid, and what's Still to pay. The money
 * set aside, less what's still to pay on every line, is the buffer.
 */
export type BucketStats = {
  /** The line's budget as set. */
  budget: number;
  /** Approved change orders charged to this line. */
  changeOrders: number;
  /**
   * What the line is allowed to cost. Approved change orders add to the cost of
   * a contract, allowance or owner line; on the cushion they are spent from it.
   */
  allowed: number;
  /** Invoices and payments, less credits: everything billed so far. */
  billed: number;
  /** Billed, less invoices received but not paid yet. */
  paid: number;
  /** Invoices received but not paid yet. */
  unpaid: number;
  /** Cost of items already chosen (decided or further) linked to this line. */
  chosen: number;
  /** What it has cost or is committed to cost: billed, or on an allowance, the cost of what's picked. */
  actual: number;
  /** What counts against the budget: actual, plus the cushion's approved change orders. */
  used: number;
  /** Budget room left (allowed less used); negative when over. */
  left: number;
  /** What the line will cost: its allowed amount, or more if it is already over. */
  expected: number;
  /** Still to pay: expected cost less what's been paid. Always owed + reserved. */
  remaining: number;
  /** Billed or committed but not paid yet. */
  owed: number;
  /** Still reserved: not billed or picked yet. */
  reserved: number;
};

const moneyOut = (l: LedgerEntry) =>
  l.kind === "invoice" || l.kind === "payment"
    ? l.amount_cents
    : l.kind === "credit"
      ? -l.amount_cents
      : 0;
const unpaidAmount = (l: LedgerEntry) => (l.kind === "invoice" && l.unpaid ? l.amount_cents : 0);

export function bucketStats(b: Bucket, ledger: LedgerEntry[], decisions: Decision[]): BucketStats {
  const mine = ledger.filter((l) => l.bucket_id === b.id);
  const billed = mine.reduce((a, l) => a + moneyOut(l), 0);
  const unpaid = mine.reduce((a, l) => a + unpaidAmount(l), 0);
  const paid = billed - unpaid;
  const changeOrders = mine
    .filter((l) => l.kind === "change_order" && l.change_order_status === "approved")
    .reduce((a, l) => a + l.amount_cents, 0);
  const chosen = decisions
    .filter((d) => d.bucket_id === b.id && CHOSEN.has(d.status))
    .reduce((a, d) => a + (d.cost_cents ?? 0), 0);
  const cushion = b.kind === "contingency";
  const allowed = cushion ? b.budget_cents : b.budget_cents + changeOrders;
  const actual = b.kind === "allowance" ? Math.max(billed, chosen) : billed;
  const used = actual + (cushion ? changeOrders : 0);
  const expected = Math.max(allowed, used);
  return {
    budget: b.budget_cents,
    changeOrders,
    allowed,
    billed,
    paid,
    unpaid,
    chosen,
    actual,
    used,
    left: allowed - used,
    expected,
    remaining: Math.max(0, expected - paid),
    owed: Math.max(0, used - paid),
    reserved: expected - used,
  };
}

/** Money billed or received that isn't linked to a budget line, so no line counts it. */
export function unlinked(buckets: Bucket[], ledger: LedgerEntry[]) {
  const ids = new Set(buckets.map((b) => b.id));
  const rows = ledger.filter((l) => !l.bucket_id || !ids.has(l.bucket_id));
  return {
    paid: rows.reduce((a, l) => a + moneyOut(l) - unpaidAmount(l), 0),
    unpaid: rows.reduce((a, l) => a + unpaidAmount(l), 0),
    count: rows.filter((l) => l.kind !== "change_order").length,
  };
}

/** Approved-but-not-counted: proposed change orders, which only count once approved. */
export function proposedChangeOrders(ledger: LedgerEntry[]) {
  const rows = ledger.filter(
    (l) => l.kind === "change_order" && l.change_order_status === "proposed",
  );
  return { total: rows.reduce((a, l) => a + l.amount_cents, 0), count: rows.length };
}

export function budgetTotals(buckets: Bucket[], ledger: LedgerEntry[], decisions: Decision[]) {
  const stats = buckets.map((b) => bucketStats(b, ledger, decisions));
  const cushion = buckets.find((b) => b.kind === "contingency");
  const loose = unlinked(buckets, ledger);
  return {
    /** Every line's allowed cost: budgets plus approved change orders outside the cushion. */
    total: stats.reduce((a, s) => a + s.allowed, 0),
    /** Money that has moved, on every line and off them. */
    paid: stats.reduce((a, s) => a + s.paid, 0) + loose.paid,
    /** Invoices received but not paid yet. */
    unpaid: stats.reduce((a, s) => a + s.unpaid, 0) + loose.unpaid,
    cushionLeft: cushion ? bucketStats(cushion, ledger, decisions).left : null,
  };
}

/**
 * What the project still needs: for each budget line, what it will cost
 * (its allowed amount, or what it's really costing if that's more) less what's
 * been paid. The cushion counts in full, as money you may still need.
 */
export function stillToPay(
  buckets: Bucket[],
  ledger: LedgerEntry[],
  decisions: Decision[],
): number {
  return buckets.reduce((a, b) => a + bucketStats(b, ledger, decisions).remaining, 0);
}

/** Money set aside, what's still to pay, and the difference. */
export function bufferSummary(
  sources: FundingSource[],
  buckets: Bucket[],
  ledger: LedgerEntry[],
  decisions: Decision[],
) {
  const funds = sources.reduce((a, s) => a + s.amount_cents, 0);
  const toPay = stillToPay(buckets, ledger, decisions);
  return { funds, toPay, buffer: funds - toPay };
}
