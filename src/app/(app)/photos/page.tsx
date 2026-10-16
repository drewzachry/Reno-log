import { ui } from "@/components/ui";
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
      <h1 className={ui.h1}>Photos</h1>
      <p className="text-muted mb-2.5 max-w-[62ch]">
        Progress shots and samples, filed by room and date. Photos of open walls before drywall are
        the most useful ones you will ever take.
      </p>
      {photos.length === 0 ? (
        <p className="border-line text-muted rounded border border-dashed p-4 text-[13.5px]">
          No photos yet. Soon you’ll add them in the chat and say what room they’re in.
        </p>
      ) : (
        rooms.map((r) => (
          <div key={r}>
            <h2 className="font-display text-muted mt-[18px] mb-1.5 text-[13px] font-bold tracking-[.07em] uppercase">
              {r}
            </h2>
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
