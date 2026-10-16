import { addDays, daysBetween } from "./dates";
import { OPEN, type Decision, type ISODate, type Milestone } from "./types";

/**
 * When a decision has to be made: its own due date if it has one, otherwise
 * its milestone's date minus the lead time. Null while the milestone has no date.
 */
export function decideBy(
  d: Pick<Decision, "due_date_override" | "milestone_key" | "lead_weeks">,
  milestoneDates: Record<string, ISODate | null>,
): ISODate | null {
  if (d.due_date_override) return d.due_date_override;
  const m = milestoneDates[d.milestone_key];
  return m ? addDays(m, -7 * (d.lead_weeks || 0)) : null;
}

export function milestoneDates(
  ms: Pick<Milestone, "key" | "date">[],
): Record<string, ISODate | null> {
  return Object.fromEntries(ms.map((m) => [m.key, m.date]));
}

export type DecisionWithDeadline = Decision & { decideBy: ISODate | null; daysLeft: number | null };

export function withDeadlines(
  decisions: Decision[],
  milestones: Pick<Milestone, "key" | "date">[],
  today: ISODate,
): DecisionWithDeadline[] {
  const dates = milestoneDates(milestones);
  return decisions.map((d) => {
    const by = decideBy(d, dates);
    return { ...d, decideBy: by, daysLeft: by ? daysBetween(today, by) : null };
  });
}

const byDeadline = (a: DecisionWithDeadline, b: DecisionWithDeadline) =>
  (a.decideBy ?? "9").localeCompare(b.decideBy ?? "9") || a.title.localeCompare(b.title);

export type Group = { name: string; items: DecisionWithDeadline[]; milestone?: Milestone };

/** The prototype's three groupings for the Decisions screen. */
export function groupDecisions(
  ds: DecisionWithDeadline[],
  by: "deadline" | "room" | "stage",
  milestones: Milestone[],
): Group[] {
  if (by === "deadline") {
    const open = ds.filter((d) => OPEN.has(d.status)).sort(byDeadline);
    const made = ds.filter((d) => !OPEN.has(d.status)).sort(byDeadline);
    return [
      { name: "Overdue", items: open.filter((d) => d.daysLeft != null && d.daysLeft < 0) },
      {
        name: "Next 3 weeks",
        items: open.filter((d) => d.daysLeft != null && d.daysLeft >= 0 && d.daysLeft <= 21),
      },
      { name: "Later", items: open.filter((d) => d.daysLeft == null || d.daysLeft > 21) },
      { name: "Made", items: made },
    ].filter((g) => g.items.length);
  }
  if (by === "room") {
    const rooms = [...new Set(ds.map((d) => d.room))].sort();
    return rooms.map((r) => ({ name: r, items: ds.filter((d) => d.room === r).sort(byDeadline) }));
  }
  return [...milestones]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      name: `Before ${m.label.toLowerCase()}`,
      milestone: m,
      items: ds.filter((d) => d.milestone_key === m.key).sort(byDeadline),
    }))
    .filter((g) => g.items.length);
}
