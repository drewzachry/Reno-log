import { daysBetween, shortDate } from "./dates";
import { OPEN, type Status } from "./types";

type Moved = {
  title: string;
  room: string;
  status: string;
  old_decide_by: string | null;
  new_decide_by: string;
};

/**
 * The message after a milestone moves: how many deadlines moved, and the open
 * decisions that matter most now (overdue first, then the soonest).
 */
export function rippleMessage(label: string, moved: Moved[], today: string) {
  if (!moved.length)
    return { headline: `${label} date saved. No deadlines depend on it yet.`, lines: [] };
  const earlier = moved[0].old_decide_by != null && moved[0].new_decide_by < moved[0].old_decide_by;
  const open = moved
    .filter((d) => OPEN.has(d.status as Status))
    .map((d) => ({ ...d, n: daysBetween(today, d.new_decide_by) }))
    .sort((a, b) => a.n - b.n);
  const headline =
    `That moves ${moved.length} deadline${moved.length === 1 ? "" : "s"}` +
    (moved[0].old_decide_by == null ? "." : earlier ? " earlier." : " later.") +
    (open.length ? ` ${open.length} still need deciding:` : "");
  const lines = open
    .slice(0, 5)
    .map(
      (d) =>
        `${d.title} (${d.room}): ${d.n < 0 ? `was due ${shortDate(d.new_decide_by)}, ${-d.n}d late` : `decide by ${shortDate(d.new_decide_by)}`}`,
    );
  if (open.length > 5) lines.push(`and ${open.length - 5} more on the Decisions tab`);
  return { headline, lines };
}
