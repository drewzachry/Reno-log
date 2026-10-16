import { bucketStats } from "./budget";
import type { DecisionWithDeadline } from "./deadlines";
import { money } from "./money";
import { OPEN, type Bucket, type LedgerEntry } from "./types";

export type UpNextItem = {
  /** Sort key: days until due; most urgent first. */
  n: number;
  text: string;
  severity: "bad" | "warn" | "";
  when: string;
  href: string;
};

/**
 * What matters now, as in the prototype: decisions overdue or due within 21
 * days, decided-but-not-ordered items past their deadline with real lead
 * times, buckets over budget, and cards waiting to be confirmed.
 */
export function upNextItems(
  decisions: DecisionWithDeadline[],
  buckets: Bucket[],
  ledger: LedgerEntry[],
  pendingCards = 0,
): UpNextItem[] {
  const items: UpNextItem[] = [];
  for (const d of decisions) {
    if (d.daysLeft == null) continue;
    const n = d.daysLeft;
    if (OPEN.has(d.status) && n <= 21) {
      items.push({
        n,
        text: `Decide: ${d.title} (${d.room})`,
        severity: n < 0 ? "bad" : n <= 7 ? "warn" : "",
        when: n < 0 ? `${-n}d late` : n === 0 ? "Today" : `in ${n}d`,
        href: `/decisions/${d.id}`,
      });
    } else if (d.status === "decided" && n < 0 && d.lead_weeks >= 3) {
      items.push({
        n: n + 0.5,
        text: `Place the order: ${d.title} (${d.room})`,
        severity: "warn",
        when: `${-n}d late`,
        href: `/decisions/${d.id}`,
      });
    }
  }
  for (const b of buckets) {
    const st = bucketStats(b, ledger, decisions);
    if (st.left < 0) {
      items.push({
        n: -999,
        text: `${b.name} is ${money(-st.left)} over budget`,
        severity: "bad",
        when: "Now",
        href: "/budget",
      });
    }
  }
  if (pendingCards) {
    items.push({
      n: -1000,
      text: `${pendingCards} update${pendingCards > 1 ? "s" : ""} waiting for you to confirm in the chat`,
      severity: "warn",
      when: "Now",
      href: "/",
    });
  }
  return items.sort((a, b) => a.n - b.n || a.text.localeCompare(b.text));
}
