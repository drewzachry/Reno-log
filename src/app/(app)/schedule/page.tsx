import { ui } from "@/components/ui";
import { getSession } from "@/lib/projects";
import { daysBetween, shortDate } from "@/lib/record/dates";
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

  return (
    <section>
      <h1 className={ui.h1}>Schedule</h1>
      <p className="text-muted mb-2.5 max-w-[62ch]">
        The key moments that set your decision deadlines. When your contractor moves a date, change
        it here and every deadline tied to it shifts.
      </p>
      <ol className="grid gap-1.5">
        {milestones.map((m) => {
          const n = m.date ? daysBetween(today, m.date) : null;
          const openCount = decisions.filter(
            (d) => d.milestone_key === m.key && OPEN.has(d.status),
          ).length;
          return (
            <li
              key={m.key}
              className="border-line bg-paper grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 rounded border px-3 py-2.5"
            >
              <span className="font-mono text-[13px]">{shortDate(m.date)}</span>
              <span className="font-semibold">{m.label}</span>
              <span className="text-muted font-mono text-xs">
                {n == null ? "" : n < 0 ? "done" : n === 0 ? "today" : `in ${n}d`}
              </span>
              <p className="text-muted col-start-2 col-end-4 text-[12.5px]">
                {m.explanation}
                {openCount > 0 && (
                  <b className="text-ink">
                    {" "}
                    {openCount} open decision{openCount > 1 ? "s" : ""} tied to this.
                  </b>
                )}
              </p>
              {editable && (
                <MoveForm milestoneKey={m.key} label={m.label} date={m.date} today={today} />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
