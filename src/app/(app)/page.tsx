import { Chat, type ChatMessage } from "@/components/chat/Chat";
import { UpNext } from "@/components/record/UpNext";
import { getSession } from "@/lib/projects";
import { can } from "@/lib/roles";
import { bucketStats, bufferSummary } from "@/lib/record/budget";
import { loadRecord } from "@/lib/record/load";
import { upNextItems } from "@/lib/record/upnext";

const SHOWN = 60;

type Row = {
  id: string;
  role: "user" | "assistant";
  text: string;
  author_id: string | null;
  file_ids: string[] | null;
  created_at: string;
  proposals: ChatMessage["cards"];
};

export default async function ChatPage() {
  const { supabase, user, current } = await getSession();
  if (!current || !user) return null;
  const [{ decisions, buckets, ledger, sources }, msgs] = await Promise.all([
    loadRecord(supabase, current.id),
    supabase
      .from("messages")
      .select(
        "id, role, text, author_id, file_ids, created_at, proposals(id, kind_label, summary, detail, warnings, state, created_at)",
      )
      .eq("project_id", current.id)
      .order("created_at", { ascending: false })
      .limit(SHOWN),
  ]);
  const buffer = sources.length ? bufferSummary(sources, buckets, ledger, decisions).buffer : null;
  const rows = ((msgs.data ?? []) as Row[]).reverse();

  // Names for other people's messages, and thumbnails for attached photos.
  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((x): x is string => !!x))];
  const fileIds = [...new Set(rows.flatMap((r) => r.file_ids ?? []))];
  const [people, files] = await Promise.all([
    authorIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", authorIds)
      : { data: [] },
    fileIds.length
      ? supabase.from("files").select("id, storage_path, mime_type").in("id", fileIds)
      : { data: [] },
  ]);
  const nameOf = new Map((people.data ?? []).map((p) => [p.id, p.display_name as string]));
  const images = (files.data ?? []).filter((f) => f.mime_type.startsWith("image/"));
  const signed = images.length
    ? (
        await supabase.storage.from("project-files").createSignedUrls(
          images.map((f) => f.storage_path),
          3600,
        )
      ).data
    : [];
  const urlOf = new Map(
    images.map((f, i) => [f.id, signed?.[i]?.signedUrl ?? null] as const).filter(([, u]) => u),
  );

  const messages: ChatMessage[] = rows.map((r) => ({
    id: r.id,
    role: r.role,
    text: r.text,
    mine: r.author_id === user.id,
    author: r.author_id && r.author_id !== user.id ? (nameOf.get(r.author_id) ?? null) : null,
    images: (r.file_ids ?? []).map((id) => urlOf.get(id)).filter((u): u is string => !!u),
    cards: [...(r.proposals ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));

  const suggestions = ["What should I be deciding now?"];
  if (buckets.some((b) => bucketStats(b, ledger, decisions).left < 0))
    suggestions.push("Where am I over budget?");
  suggestions.push("What happens at rough-in?");

  return (
    <div className="grid gap-3">
      <UpNext items={upNextItems(decisions, buckets, ledger, 0, buffer)} />
      <Chat
        projectId={current.id}
        canEdit={can.edit(current.role)}
        messages={messages}
        suggestions={messages.length > 6 ? [] : suggestions}
      />
    </div>
  );
}
