import { EmptyState, PageHeader, SectionTitle } from "@/components/page";
import { getSession } from "@/lib/projects";
import { shortDate } from "@/lib/record/dates";

export const metadata = { title: "Photos" };

type PhotoRow = {
  id: string;
  room: string | null;
  caption: string | null;
  taken_on: string | null;
  created_at: string;
};

export default async function PhotosPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { data } = await supabase
    .from("photos")
    .select("id, room, caption, taken_on, created_at")
    .eq("project_id", current.id)
    .order("created_at", { ascending: false })
    .returns<PhotoRow[]>();
  const photos = data ?? [];
  const rooms = [...new Set(photos.map((p) => p.room ?? "Other"))];

  return (
    <section>
      <PageHeader
        title="Photos"
        lede="Progress shots and samples, filed by room and date. Photos of open walls before drywall are the most useful ones you’ll ever take."
      />
      {photos.length === 0 ? (
        <EmptyState>
          No photos yet. Soon you’ll add them in the chat and say what room they’re in.
        </EmptyState>
      ) : (
        rooms.map((r) => (
          <div key={r}>
            <SectionTitle>{r}</SectionTitle>
            <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
              {photos
                .filter((p) => (p.room ?? "Other") === r)
                .map((p) => (
                  <li key={p.id} className="border-line bg-paper rounded border p-2 text-[12.5px]">
                    <span className="text-muted font-mono">
                      {shortDate(p.taken_on ?? p.created_at.slice(0, 10))}
                    </span>
                    <br />
                    {p.caption}
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
