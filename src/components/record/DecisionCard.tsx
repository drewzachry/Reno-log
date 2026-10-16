import Link from "next/link";
import { Pill } from "@/components/page";
import type { DecisionWithDeadline } from "@/lib/record/deadlines";
import { daysText, shortDate } from "@/lib/record/dates";
import { money } from "@/lib/record/money";
import { OPEN, STATUS_LABEL, type Bucket } from "@/lib/record/types";
import { StatusSelect } from "./StatusSelect";

/** How urgent an open decision is, for its colour and label. */
export function urgency(d: Pick<DecisionWithDeadline, "status" | "daysLeft">) {
  if (!OPEN.has(d.status) || d.daysLeft == null) return "none" as const;
  return d.daysLeft < 0
    ? ("late" as const)
    : d.daysLeft <= 14
      ? ("soon" as const)
      : ("later" as const);
}

/** One decision: what it is, when it's due, and its status. Tap the top to open it. */
export function DecisionCard({
  d,
  bucket,
  canEdit,
}: {
  d: DecisionWithDeadline;
  bucket?: Bucket;
  canEdit: boolean;
}) {
  const u = urgency(d);
  const when =
    d.decideBy == null
      ? "date once the schedule is set"
      : u === "late"
        ? `was due ${shortDate(d.decideBy)}`
        : OPEN.has(d.status)
          ? `decide by ${shortDate(d.decideBy)}`
          : null;

  return (
    <article
      className={`border-line bg-paper rounded border ${
        u === "late"
          ? "shadow-[inset_3px_0_0_var(--bad)]"
          : u === "soon"
            ? "shadow-[inset_3px_0_0_var(--warn)]"
            : ""
      }`}
    >
      <Link href={`/decisions/${d.id}`} className="block px-3 pt-2.5 pb-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold">{d.title}</span>
          {u === "late" && <Pill tone="bad">{daysText(d.daysLeft!)}</Pill>}
          {u === "soon" && <Pill tone="warn">{daysText(d.daysLeft!)}</Pill>}
        </span>
        <span className="text-muted block text-[13px]">
          {d.room}
          {d.lead_weeks > 0 && ` · ${d.lead_weeks}-week lead`}
          {when && ` · ${when}`}
        </span>
        {OPEN.has(d.status) && d.why && (
          <span className="text-muted mt-1 line-clamp-2 block text-[13.5px]">{d.why}</span>
        )}
        {d.selection && (
          <span className="mt-1 block text-[13.5px]">
            <span className="text-muted">Picked:</span> {d.selection}
            {d.cost_cents != null && <span className="tabular-nums"> · {money(d.cost_cents)}</span>}
            {bucket && <span className="text-muted"> · {bucket.name}</span>}
          </span>
        )}
      </Link>
      <div className="px-3 pb-2.5">
        {canEdit ? (
          <StatusSelect id={d.id} title={`${d.title} (${d.room})`} status={d.status} />
        ) : (
          <Pill tone={OPEN.has(d.status) ? "neutral" : "ok"}>{STATUS_LABEL[d.status]}</Pill>
        )}
      </div>
    </article>
  );
}
