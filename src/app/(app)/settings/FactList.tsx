"use client";

import { useState, useTransition } from "react";
import { forgetFact } from "@/lib/actions/chat";

export type Fact = { id: string; fact: string; category: string };

const CATEGORY: Record<string, string> = {
  preference: "Preference",
  constraint: "Rule",
  person: "Who’s who",
  vendor: "Vendor",
  other: "Other",
};

/** Things said in chat that the assistant keeps in mind in every answer. */
export function FactList({ facts, canEdit }: { facts: Fact[]; canEdit: boolean }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!facts.length)
    return (
      <p className="text-muted border-line bg-paper rounded border p-3 text-[14px]">
        Nothing yet. When you tell the chat something lasting, like “we want brushed nickel
        everywhere” or “Kate decides on tile”, it offers to remember it.
      </p>
    );

  return (
    <div className="grid gap-2">
      <ul className="border-line bg-paper divide-line divide-y rounded border">
        {facts.map((f) => (
          <li key={f.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] [overflow-wrap:anywhere]">{f.fact}</p>
              <p className="text-muted text-[12.5px]">{CATEGORY[f.category] ?? f.category}</p>
            </div>
            {canEdit && (
              <button
                type="button"
                className="border-line min-h-11 flex-none rounded border px-3 text-[14px] disabled:opacity-50"
                disabled={busy}
                aria-label={`Forget: ${f.fact}`}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await forgetFact(f.id);
                    if (!r.ok) setError(r.error);
                  })
                }
              >
                Forget
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="bg-bad-soft rounded px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
