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
  file: { storage_path: string } | null;
};

export default async function PhotosPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { data } = await supabase
    .from("photos")
    .select("id, room, caption, taken_on, created_at, file:files(storage_path)")
    .eq("project_id", current.id)
    .order("created_at", { ascending: false })
    .returns<PhotoRow[]>();
  const photos = data ?? [];
  // Originals stay private; signed links last an hour.
  const { data: signed } = photos.length
    ? await supabase.storage.from("project-files").createSignedUrls(
        photos.map((p) => p.file?.storage_path ?? ""),
        3600,
      )
    : { data: [] };
  const urlOf = new Map(photos.map((p, i) => [p.id, signed?.[i]?.signedUrl ?? null]));
  const rooms = [...new Set(photos.map((p) => p.room ?? "Other"))];

  return (
    <section>
      <PageHeader
        title="Photos"
        lede="Progress shots and samples, filed by room and date. Photos of open walls before drywall are the most useful ones you’ll ever take."
      />
      {photos.length === 0 ? (
        <EmptyState>No photos yet. Add one in the chat and say what room it’s in.</EmptyState>
      ) : (
        rooms.map((r) => (
          <div key={r}>
            <SectionTitle>{r}</SectionTitle>
            <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
              {photos
                .filter((p) => (p.room ?? "Other") === r)
                .map((p) => (
                  <li
                    key={p.id}
                    className="border-line bg-paper grid gap-1.5 rounded border p-2 text-[12.5px]"
                  >
                    {urlOf.get(p.id) && (
                      <a href={urlOf.get(p.id)!} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={urlOf.get(p.id)!}
                          alt={p.caption ?? "Photo"}
                          className="aspect-square w-full rounded object-cover"
                        />
                      </a>
                    )}
                    <span className="text-muted font-mono">
                      {shortDate(p.taken_on ?? p.created_at.slice(0, 10))}
                    </span>
                    <span>{p.caption}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
