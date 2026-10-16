import Link from "next/link";
import { UpNext } from "@/components/record/UpNext";
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
    <div className="grid gap-4">
      <UpNext items={upNextItems(decisions, buckets, ledger, 0, buffer)} />
      <section
        aria-label="Chat"
        className="border-line rounded border border-dashed px-4 py-5 text-center"
      >
        <p className="font-semibold">The chat is coming next</p>
        <p className="text-muted mx-auto mt-1 max-w-[36ch] text-[14px]">
          You’ll tell it what happened on site or snap an invoice, and it will fill in the record
          for you.
        </p>
        <p className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[14px] font-medium">
          <Link href="/decisions" className="text-accent">
            Decisions
          </Link>
          <Link href="/schedule" className="text-accent">
            Schedule
          </Link>
          <Link href="/budget" className="text-accent">
            Budget
          </Link>
        </p>
      </section>
    </div>
  );
}
