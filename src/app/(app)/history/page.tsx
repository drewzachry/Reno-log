import { EventList, type EventRow } from "@/components/record/EventList";
import { EmptyState, PageHeader } from "@/components/page";
import { getSession } from "@/lib/projects";
import { viewerTimeZone } from "@/lib/record/load";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;

  const [{ data }, { data: buckets }] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, summary, created_at, before, after, reason, actor:profiles!events_actor_id_fkey(display_name, email)",
      )
      .eq("project_id", current.id)
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<EventRow[]>(),
    supabase.from("budget_buckets").select("id, name").eq("project_id", current.id),
  ]);
  const names = new Map((buckets ?? []).map((b) => [b.id as string, b.name as string]));
  const events = data ?? [];

  return (
    <section>
      <PageHeader
        title="History"
        lede="Every change, newest first. Nothing is overwritten: when a choice changes, the old one stays here."
      />
      {events.length === 0 ? (
        <EmptyState>Nothing logged yet.</EmptyState>
      ) : (
        <EventList
          events={events}
          bucketName={(id) => names.get(id)}
          timeZone={await viewerTimeZone()}
        />
      )}
    </section>
  );
}
