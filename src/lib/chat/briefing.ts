import { bucketStats, bufferSummary } from "@/lib/record/budget";
import type { DecisionWithDeadline } from "@/lib/record/deadlines";
import { daysText } from "@/lib/record/dates";
import { money } from "@/lib/record/money";
import type { Bucket, FundingSource, ISODate, LedgerEntry, Milestone } from "@/lib/record/types";

export type BriefingInput = {
  projectName: string;
  today: ISODate;
  milestones: Milestone[];
  buckets: Bucket[];
  ledger: LedgerEntry[];
  sources: FundingSource[];
  decisions: DecisionWithDeadline[];
  facts: { fact: string; category: string }[];
  documents?: {
    title: string;
    kind: string;
    summary: string | null;
    status: string;
    facts: { topic: string; detail: string; page: number | null }[];
  }[];
};

const LONG = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const longDate = (d: ISODate) => LONG.format(new Date(`${d}T00:00:00Z`));
const cell = (s: string | null | undefined) => (s ?? "").replace(/[|\n]+/g, " ").trim() || "-";

/**
 * The project as the assistant sees it, rebuilt from the database for every
 * turn. This is the assistant's memory: the record, not the chat.
 */
export function buildBriefing(b: BriefingInput): string {
  const out: string[] = [];
  out.push(`Project: ${cell(b.projectName)}`);
  out.push(`Today: ${longDate(b.today)} (${b.today})`);

  out.push("", "## Stages (milestone_key | name | date)");
  for (const m of b.milestones) out.push(`${m.key} | ${m.label} | ${m.date ?? "no date yet"}`);

  const bucketName = new Map(b.buckets.map((x) => [x.id, x.name]));
  out.push(
    "",
    "## Decisions (id | room | title | status | stage | decide by | selection | cost | budget line)",
  );
  const sorted = [...b.decisions].sort(
    (x, y) =>
      (x.decideBy ?? "9").localeCompare(y.decideBy ?? "9") || x.title.localeCompare(y.title),
  );
  for (const d of sorted) {
    out.push(
      [
        d.id,
        cell(d.room),
        cell(d.title),
        d.status,
        d.milestone_key,
        d.decideBy ? `${d.decideBy} (${daysText(d.daysLeft ?? 0).toLowerCase()})` : "-",
        cell(d.selection),
        d.cost_cents == null ? "-" : money(d.cost_cents),
        d.bucket_id ? cell(bucketName.get(d.bucket_id)) : "-",
      ].join(" | "),
    );
  }
  if (!sorted.length) out.push("(none yet)");

  out.push(
    "",
    "## Budget lines (id | name | kind | budget | actual | paid | still to pay | room left)",
    "Budget includes approved change orders (except on the cushion). Actual is what's billed or picked. Still to pay is what the line will cost less what's paid; it includes money reserved for work not billed or picked yet.",
  );
  for (const x of b.buckets) {
    const s = bucketStats(x, b.ledger, b.decisions);
    out.push(
      [
        x.id,
        cell(x.name),
        x.kind,
        money(s.allowed),
        money(s.actual),
        money(s.paid),
        money(s.remaining),
        s.left < 0 ? `${money(-s.left)} OVER` : money(s.left),
      ].join(" | "),
    );
  }
  if (!b.buckets.length) out.push("(none yet)");

  if (b.sources.length) {
    const f = bufferSummary(b.sources, b.buckets, b.ledger, b.decisions);
    out.push(
      "",
      "## Money set aside",
      ...b.sources.map((s) => `${cell(s.name)}: ${money(s.amount_cents)}`),
      `Total ${money(f.funds)}; still to pay ${money(f.toPay)}; buffer ${money(f.buffer)}`,
    );
  }

  out.push(
    "",
    "## Recent ledger, newest first (date | kind | vendor | amount | what | budget line)",
  );
  for (const l of b.ledger.slice(0, 15)) {
    out.push(
      [
        l.date,
        l.kind === "change_order" ? `change order (${l.change_order_status})` : l.kind,
        cell(l.vendor),
        money(l.amount_cents),
        cell(l.description),
        l.bucket_id ? cell(bucketName.get(l.bucket_id)) : "-",
      ].join(" | "),
    );
  }
  if (!b.ledger.length) out.push("(nothing logged yet)");

  out.push("", "## Remembered facts");
  for (const f of b.facts) out.push(`- (${f.category}) ${cell(f.fact)}`);
  if (!b.facts.length) out.push("(none yet)");

  const docs = b.documents ?? [];
  out.push("", "## Documents (summaries and key facts; cite as Title, p.N)");
  for (const d of docs.filter((x) => x.status === "ready")) {
    out.push(`### ${cell(d.title)} (${d.kind})`, cell(d.summary));
    for (const f of d.facts)
      out.push(`- [${f.topic}] ${cell(f.detail)}${f.page ? ` (p.${f.page})` : ""}`);
  }
  const reading = docs.filter((x) => x.status === "reading").map((x) => cell(x.title));
  if (reading.length) out.push(`Still being read: ${reading.join("; ")}`);
  if (!docs.length) out.push("(none uploaded yet)");

  return out.join("\n");
}
