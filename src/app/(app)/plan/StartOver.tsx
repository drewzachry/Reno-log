"use client";

import { useState, useTransition } from "react";
import { discardPlan } from "@/lib/actions/setup";

/** Stops waiting for a draft and goes back to the questions, answers kept. */
export function StartOver({ planId }: { planId: string }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="mt-4 grid gap-2">
      <button
        type="button"
        className="border-line min-h-11 rounded border px-4 text-[15px] disabled:opacity-50 md:justify-self-start"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await discardPlan(planId);
            if (r.error) setError(r.error);
          })
        }
      >
        Start over
      </button>
      {error && (
        <p role="alert" className="bg-bad-soft rounded px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
