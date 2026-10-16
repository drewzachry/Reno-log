"use client";

import { useState, useTransition } from "react";
import { setDecisionStatus } from "@/lib/actions/record";
import { OPEN, STATUSES, type Status } from "@/lib/record/types";

/** Compact status control; saves as soon as it changes. */
export function StatusSelect({ id, title, status }: { id: string; title: string; status: Status }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const made = !OPEN.has(value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Status for ${title}`}
        className={`min-h-10 rounded-full border px-3 pr-8 text-[14px] font-medium ${
          made ? "border-ok/40 bg-ok-soft text-ok" : "border-line bg-bg text-ink"
        } ${pending ? "opacity-60" : ""}`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Status;
          const prev = value;
          setValue(next);
          setError(undefined);
          start(async () => {
            const r = await setDecisionStatus(id, next);
            if (!r.ok) {
              setValue(prev);
              setError(r.error);
            }
          });
        }}
      >
        {STATUSES.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      {pending && <span className="text-muted text-xs">Saving…</span>}
      {error && (
        <p role="alert" className="text-bad text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
