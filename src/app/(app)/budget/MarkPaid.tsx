"use client";

import { useState, useTransition } from "react";
import { setInvoicePaid } from "@/lib/actions/record";

/** Settles an invoice (or sets it back to not paid), for editors. */
export function MarkPaid({ id, paid, vendor }: { id: string; paid: boolean; vendor: string }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={`${paid ? "Mark not paid" : "Mark paid"}: ${vendor}`}
        className={
          paid
            ? "text-muted min-h-9 text-[12.5px] underline disabled:opacity-50"
            : "bg-accent text-accent-ink min-h-10 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
        }
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await setInvoicePaid(id, !paid);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {busy ? "Saving…" : paid ? "Mark not paid" : "Mark paid"}
      </button>
      {error && (
        <p role="alert" className="bg-bad-soft basis-full rounded px-2 py-1 text-[13px]">
          {error}
        </p>
      )}
    </>
  );
}
