"use client";

import { useState, useTransition } from "react";
import { setDecisionStatus } from "@/lib/actions/record";
import { STATUSES, type Status } from "@/lib/record/types";

export function StatusSelect({ id, title, status }: { id: string; title: string; status: Status }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-1 md:justify-items-end">
      <select
        aria-label={`Status for ${title}`}
        className="border-line bg-bg min-h-10 w-full rounded border px-2 text-[15px] md:min-h-0 md:w-auto md:py-1 md:text-[12.5px]"
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
      {error && (
        <p role="alert" className="text-bad text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
