import { PageHeader, Pill } from "@/components/page";
import { getSession } from "@/lib/projects";
import { daysBetween, daysText, shortDate } from "@/lib/record/dates";
import { loadRecord } from "@/lib/record/load";
import { OPEN } from "@/lib/record/types";
import { can } from "@/lib/roles";
import { MoveForm } from "./MoveForm";

export const metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { milestones, decisions, today } = await loadRecord(supabase, current.id);
  const editable = can.edit(current.role);
  const nextKey = milestones.find((m) => m.date && daysBetween(today, m.date) >= 0)?.key;

  return (
    <section>
      <PageHeader
        title="Schedule"
        lede="The big moments that set your deadlines. When your contractor moves one, change it here and every deadline tied to it moves too."
      />
      <ol className="grid gap-2">
        {milestones.map((m) => {
          const n = m.date ? daysBetween(today, m.date) : null;
          const openCount = decisions.filter(
            (d) => d.milestone_key === m.key && OPEN.has(d.status),
          ).length;
          const past = n != null && n < 0;
          return (
            <li
              key={m.key}
              className={`bg-paper grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 rounded border px-3 py-3 ${
                m.key === nextKey
                  ? "border-accent/50 shadow-[inset_3px_0_0_var(--accent)]"
                  : "border-line"
              } ${past ? "opacity-70" : ""}`}
            >
              <div>
                <p className="font-semibold tabular-nums">
                  {m.date ? shortDate(m.date) : "No date"}
                </p>
                <p className="text-muted text-[12.5px]">
                  {n == null ? "" : past ? "done" : daysText(n)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{m.label}</span>
                  {m.key === nextKey && <Pill tone="accent">Next</Pill>}
                  {openCount > 0 && <Pill tone={past ? "bad" : "neutral"}>{openCount} open</Pill>}
                </p>
                <p className="text-muted mt-0.5 text-[13px]">{m.explanation}</p>
                {editable && (
                  <MoveForm milestoneKey={m.key} label={m.label} date={m.date} today={today} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
