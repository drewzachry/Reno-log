"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import { saveDecision, type DecisionFormState } from "@/lib/actions/record";
import { STATUSES, type Bucket, type Status } from "@/lib/record/types";

export function DecisionForm({
  id,
  status,
  selection,
  costCents,
  bucketId,
  buckets,
}: {
  id: string;
  status: Status;
  selection: string | null;
  costCents: number | null;
  bucketId: string | null;
  buckets: Bucket[];
}) {
  const [state, action, pending] = useActionState(saveDecision, {} as DecisionFormState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="decisionId" value={id} />
      <div>
        <label className={ui.label} htmlFor="status">
          Status
        </label>
        <select id="status" name="status" className={ui.input} defaultValue={status}>
          {STATUSES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={ui.label} htmlFor="selection">
          What you picked
        </label>
        <input
          id="selection"
          name="selection"
          className={ui.input}
          defaultValue={selection ?? ""}
          placeholder="e.g. Hex Carrara marble mosaic"
          maxLength={500}
        />
      </div>
      <div className="grid gap-3 min-[420px]:grid-cols-2">
        <div>
          <label className={ui.label} htmlFor="cost">
            Cost
          </label>
          <input
            id="cost"
            name="cost"
            className={`${ui.input} font-mono`}
            inputMode="decimal"
            defaultValue={costCents == null ? "" : (costCents / 100).toLocaleString("en-US")}
            placeholder="$"
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="bucket">
            Paid from
          </label>
          <select id="bucket" name="bucket" className={ui.input} defaultValue={bucketId ?? ""}>
            <option value="">Not linked</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={ui.label} htmlFor="reason">
          Why (optional)
        </label>
        <input
          id="reason"
          name="reason"
          className={ui.input}
          placeholder="e.g. Kate preferred it; in stock locally"
          maxLength={1000}
        />
      </div>
      {state.error && (
        <p role="alert" className={ui.error}>
          {state.error}
        </p>
      )}
      {state.saved && !pending && (
        <p role="status" className={ui.ok}>
          Saved. The change is in the history below.
        </p>
      )}
      <button className={ui.btn} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
