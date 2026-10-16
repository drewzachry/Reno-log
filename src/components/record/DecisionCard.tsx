import Link from "next/link";
import type { DecisionWithDeadline } from "@/lib/record/deadlines";
import { shortDate } from "@/lib/record/dates";
import { money } from "@/lib/record/money";
import { OPEN, STATUS_LABEL, type Bucket } from "@/lib/record/types";
import { StatusSelect } from "./StatusSelect";

/** One decision, as the prototype's .dec card. */
export function DecisionCard({
  d,
  milestoneLabel,
  bucket,
  canEdit,
}: {
  d: DecisionWithDeadline;
  milestoneLabel: string;
  bucket?: Bucket;
  canEdit: boolean;
}) {
  const open = OPEN.has(d.status);
  const n = d.daysLeft;
  const urgency = open && n != null ? (n < 0 ? "bad" : n <= 14 ? "warn" : "") : "";
  const due = d.decideBy
    ? open
      ? n! < 0
        ? `Was due ${shortDate(d.decideBy)} · ${-n!}d late`
        : `Decide by ${shortDate(d.decideBy)}${n! <= 30 ? ` · ${n}d` : ""}`
      : `${n! < 0 ? "Was due" : "Due"} ${shortDate(d.decideBy)}`
    : "Decide-by date set once the schedule has dates";

  return (
    <article
      className={`border-line bg-paper grid gap-x-3 gap-y-1 rounded border px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_auto] ${
        urgency === "bad"
          ? "shadow-[inset_3px_0_0_var(--bad)]"
          : urgency === "warn"
            ? "shadow-[inset_3px_0_0_var(--warn)]"
            : ""
      }`}
    >
      <div className="min-w-0">
        <Link href={`/decisions/${d.id}`} className="font-semibold">
          {d.title}
        </Link>
        <p className="text-muted flex flex-wrap gap-x-2.5 text-[12.5px]">
          <span>{d.room}</span>
          {d.category && <span>{d.category}</span>}
          {d.lead_weeks > 0 && <span className="font-mono">{d.lead_weeks} wk lead</span>}
          <span>before {milestoneLabel.toLowerCase()}</span>
        </p>
      </div>
      {canEdit ? (
        <StatusSelect id={d.id} title={`${d.title} (${d.room})`} status={d.status} />
      ) : (
        <span className="text-muted self-start text-[12.5px]">{STATUS_LABEL[d.status]}</span>
      )}
      <p
        className={`font-mono text-[12.5px] font-medium md:col-span-2 ${
          urgency === "bad" ? "text-bad" : urgency === "warn" ? "text-warn" : "text-muted"
        }`}
      >
        {due}
      </p>
      {d.selection && (
        <p className="text-[13.5px] md:col-span-2">
          <b>Picked:</b> {d.selection}
          {d.cost_cents != null && <span className="font-mono"> · {money(d.cost_cents)}</span>}
          {bucket && (
            <span className="border-line bg-bg ml-1.5 rounded-full border px-2 py-px text-[11.5px]">
              {bucket.name}
            </span>
          )}
        </p>
      )}
      {open && d.why && (
        <p className="text-muted max-w-[68ch] text-[13.5px] md:col-span-2">{d.why}</p>
      )}
      {d.source && <p className="text-muted text-xs md:col-span-2">From: {d.source}</p>}
    </article>
  );
}
