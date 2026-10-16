import { ui } from "@/components/ui";
import { getSession } from "@/lib/projects";

export const metadata = { title: "History" };

type EventRow = {
  id: string;
  summary: string;
  created_at: string;
  actor: { display_name: string | null; email: string } | null;
};

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export default async function HistoryPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;

  const { data } = await supabase
    .from("events")
    .select("id, summary, created_at, actor:profiles!events_actor_id_fkey(display_name, email)")
    .eq("project_id", current.id)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<EventRow[]>();
  const events = data ?? [];

  return (
    <section>
      <h1 className={ui.h1}>History</h1>
      <p className="text-muted mb-3">Every change to your project, who made it, and when.</p>
      {events.length === 0 ? (
        <p className={ui.note}>Nothing yet.</p>
      ) : (
        <ul className="divide-line divide-y">
          {events.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[72px_minmax(0,1fr)] gap-2.5 py-2.5 text-[13.5px]"
            >
              <time className="text-muted font-mono text-xs" dateTime={e.created_at}>
                {day.format(new Date(e.created_at))}
                <span className="block">{time.format(new Date(e.created_at))}</span>
              </time>
              <div>
                {e.summary}
                <span className="text-muted block text-xs">
                  {e.actor?.display_name ?? e.actor?.email ?? "Someone"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
