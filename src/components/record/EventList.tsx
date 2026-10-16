import { describeChange } from "@/lib/record/history";

export type EventRow = {
  id: string;
  summary: string;
  created_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  actor: { display_name: string | null; email: string } | null;
};

const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** History entries, newest first, with what changed and why. */
export function EventList({
  events,
  bucketName,
  timeZone,
}: {
  events: EventRow[];
  bucketName?: (id: string) => string | undefined;
  timeZone?: string;
}) {
  // Shown in the viewer's own time zone, not the server's.
  const fmt = (o: Intl.DateTimeFormatOptions, d: Date) => {
    try {
      return new Intl.DateTimeFormat("en-US", { ...o, timeZone }).format(d);
    } catch {
      return new Intl.DateTimeFormat("en-US", o).format(d);
    }
  };
  return (
    <ul className="divide-line divide-y">
      {events.map((e) => {
        const change = describeChange(e.before, e.after, bucketName);
        const at = new Date(e.created_at);
        return (
          <li
            key={e.id}
            className="grid grid-cols-[72px_minmax(0,1fr)] gap-2.5 py-2.5 text-[13.5px]"
          >
            <time className="text-muted font-mono text-xs" dateTime={e.created_at}>
              {fmt(DAY, at)}
              <span className="block">{fmt(TIME, at)}</span>
            </time>
            <div>
              {e.summary}
              {change && (
                <span className="text-muted block text-[12.5px]">
                  Was: {change.was} · Now: {change.now}
                </span>
              )}
              {e.reason && <span className="text-muted block text-[12.5px]">Why: {e.reason}</span>}
              <span className="text-muted block text-xs">
                {e.actor?.display_name ?? e.actor?.email ?? "Someone"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
