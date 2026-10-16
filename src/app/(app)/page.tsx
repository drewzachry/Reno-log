import { UpNext } from "@/components/record/UpNext";
import { ui } from "@/components/ui";
import { getSession } from "@/lib/projects";
import { bufferSummary } from "@/lib/record/budget";
import { loadRecord } from "@/lib/record/load";
import { upNextItems } from "@/lib/record/upnext";

export default async function ChatPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { decisions, buckets, ledger, sources } = await loadRecord(supabase, current.id);
  const buffer = sources.length ? bufferSummary(sources, buckets, ledger, decisions).buffer : null;

  return (
    <div className="grid gap-3">
      <UpNext items={upNextItems(decisions, buckets, ledger, 0, buffer)} />
      <section>
        <h1 className={ui.h1}>Chat</h1>
        <p className="text-muted">
          Coming next: tell me what happened on site, or drop in an invoice or photo, and I’ll turn
          it into your project record. Until then, update decisions and dates from their tabs.
        </p>
      </section>
    </div>
  );
}
