"use client";

import { useState, useTransition } from "react";
import { confirmCard, dismissCard } from "@/lib/actions/chat";

export type CardData = {
  id: string;
  kind_label: string;
  summary: string;
  detail: string | null;
  warnings: string[];
  state: "pending" | "confirmed" | "dismissed" | "failed";
};

const FRAME = {
  pending: "border-l-pending bg-pending-soft",
  confirmed: "border-l-ok bg-ok-soft",
  dismissed: "border-l-line opacity-70",
  failed: "border-l-bad bg-bad-soft",
};

/** A proposed change. Nothing is saved until someone taps Log it. */
export function ProposalCard({ card, canEdit }: { card: CardData; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState(card.state);
  const [error, setError] = useState<string | null>(null);
  const shown = card.state !== "pending" ? card.state : state;

  // The card shows the outcome at once; if the server says no, it goes back.
  function act(kind: "confirm" | "dismiss") {
    setError(null);
    setState(kind === "confirm" ? "confirmed" : "dismissed");
    start(async () => {
      const r = await (kind === "confirm" ? confirmCard : dismissCard)(card.id);
      if (!r.ok) {
        setState("pending");
        setError(r.error);
      }
    });
  }

  return (
    <article
      aria-label={`${card.kind_label}: ${card.summary}`}
      className={`border-line grid gap-1.5 rounded border border-l-4 px-3 py-2.5 ${FRAME[shown]}`}
    >
      <p className="text-[11px] font-bold tracking-[.09em] uppercase">{card.kind_label}</p>
      <p className="font-semibold [overflow-wrap:anywhere]">{card.summary}</p>
      {card.detail && (
        <p className="text-muted text-[13.5px] [overflow-wrap:anywhere] whitespace-pre-line">
          {card.detail}
        </p>
      )}
      {card.warnings.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {card.warnings.map((w) => (
            <li
              key={w}
              className="bg-warn-soft text-warn rounded-full px-2 py-0.5 text-[12.5px] font-medium"
            >
              {w}
            </li>
          ))}
        </ul>
      )}
      {shown === "pending" ? (
        canEdit ? (
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className="bg-accent text-accent-ink min-h-11 flex-1 rounded px-4 text-[15px] font-semibold disabled:opacity-50 md:flex-none"
              disabled={pending}
              onClick={() => act("confirm")}
            >
              {pending ? "Saving…" : "Log it"}
            </button>
            <button
              type="button"
              className="border-line min-h-11 flex-1 rounded border px-4 text-[15px] disabled:opacity-50 md:flex-none"
              disabled={pending}
              onClick={() => act("dismiss")}
            >
              Not now
            </button>
          </div>
        ) : (
          <p className="text-muted text-[12.5px] font-semibold">Waiting for an editor to log it</p>
        )
      ) : (
        <p className="text-[12.5px] font-semibold">
          {shown === "confirmed" ? "✓ Logged" : shown === "dismissed" ? "Skipped" : "Didn’t save"}
        </p>
      )}
      {error && (
        <p role="alert" className="bg-bad-soft rounded px-2 py-1 text-[13px]">
          {error}
        </p>
      )}
    </article>
  );
}
