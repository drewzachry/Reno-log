"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeDocument, retryDocument } from "@/lib/actions/documents";

export function DocumentActions({
  id,
  failed,
  title,
}: {
  id: string;
  failed: boolean;
  title: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {failed && (
        <button
          type="button"
          className="bg-accent text-accent-ink min-h-11 rounded px-4 text-[15px] font-semibold disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await retryDocument(id);
              if (!r.ok) setError(r.error);
              router.refresh();
            })
          }
        >
          Try again
        </button>
      )}
      <button
        type="button"
        className="border-bad/40 text-bad min-h-11 rounded border px-4 text-[15px] disabled:opacity-50"
        disabled={busy}
        onClick={() => {
          if (
            !confirm(`Remove “${title}”? The chat will stop using it. The original file is kept.`)
          )
            return;
          start(async () => {
            const r = await removeDocument(id);
            if (r.ok) router.push("/documents");
            else setError(r.error);
          });
        }}
      >
        Remove
      </button>
      {error && (
        <p role="alert" className="bg-bad-soft rounded px-3 py-2 text-sm md:basis-full">
          {error}
        </p>
      )}
    </>
  );
}
