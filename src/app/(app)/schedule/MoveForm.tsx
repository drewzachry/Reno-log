"use client";

import { useActionState, useState } from "react";
import { ui } from "@/components/ui";
import { moveMilestone, type MoveState } from "@/lib/actions/record";
import { rippleMessage } from "@/lib/record/ripple";

/** "Change date" for one milestone, then the ripple: which deadlines moved. */
export function MoveForm({
  milestoneKey,
  label,
  date,
  today,
}: {
  milestoneKey: string;
  label: string;
  date: string | null;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(moveMilestone, {} as MoveState);
  const [dismissed, setDismissed] = useState<MoveState | null>(null);
  const ripple =
    state.result && dismissed !== state
      ? rippleMessage(label, state.result.moved ?? [], today)
      : null;

  return (
    <div className="col-span-full">
      {!open && !ripple && (
        <button
          type="button"
          className="text-accent min-h-9 text-[13px] font-medium"
          onClick={() => setOpen(true)}
        >
          {date ? "Change date" : "Set date"}
        </button>
      )}
      {open && !ripple && (
        <form action={action} className="mt-2 grid gap-2">
          <input type="hidden" name="key" value={milestoneKey} />
          <label className={ui.label} htmlFor={`date-${milestoneKey}`}>
            New date for {label.toLowerCase()}
          </label>
          <input
            id={`date-${milestoneKey}`}
            name="date"
            type="date"
            className={ui.input}
            defaultValue={date ?? ""}
            required
          />
          <input
            name="reason"
            className={ui.input}
            aria-label="Why it moved (optional)"
            placeholder="Why it moved (optional), e.g. GC says plumber is behind"
            maxLength={1000}
          />
          {state.error && (
            <p role="alert" className={ui.error}>
              {state.error}
            </p>
          )}
          <div className="flex gap-2">
            <button className={ui.btn} disabled={pending}>
              {pending ? "Saving…" : "Save date"}
            </button>
            <button type="button" className={ui.ghost} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {ripple && (
        <div role="status" className="bg-accent-soft mt-2 rounded px-3 py-2 text-[13.5px]">
          <p className="font-semibold">{ripple.headline}</p>
          {ripple.lines.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {ripple.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="text-accent mt-1 min-h-9 font-medium"
            onClick={() => {
              setDismissed(state);
              setOpen(false);
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
