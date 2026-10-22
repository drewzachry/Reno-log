"use client";

import { useState, useTransition } from "react";
import { discardPlan, savePlan } from "@/lib/actions/setup";

/** Save or go back, kept in reach at the bottom of the preview. */
export function PlanActions({ planId }: { planId: string }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="border-line bg-bg sticky -bottom-3 -mx-[max(16px,env(safe-area-inset-left))] mt-4 grid gap-2 border-t px-[max(16px,env(safe-area-inset-left))] pt-3 pb-3 md:mx-0 md:flex md:border-0 md:px-0">
      {error && (
        <p role="alert" className="bg-bad-soft rounded px-3 py-2 text-sm md:basis-full">
          {error}
        </p>
      )}
      <button
        type="button"
        className="bg-accent text-accent-ink min-h-11 rounded px-4 text-[15px] font-semibold disabled:opacity-50"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await savePlan(planId);
            if (r?.error) setError(r.error);
          })
        }
      >
        {busy ? "Saving…" : "Save to my project"}
      </button>
      <button
        type="button"
        className="border-line min-h-11 rounded border px-4 text-[15px] disabled:opacity-50"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await discardPlan(planId);
            if (r.error) setError(r.error);
          })
        }
      >
        Change my answers
      </button>
    </div>
  );
}
