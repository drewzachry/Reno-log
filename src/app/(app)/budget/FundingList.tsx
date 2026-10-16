"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { removeFunding, saveFunding, type FundingState } from "@/lib/actions/record";
import { money } from "@/lib/record/money";
import type { FundingSource } from "@/lib/record/types";

function AccountForm({ source, onDone }: { source?: FundingSource; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveFunding, {} as FundingState);
  const [removeError, setRemoveError] = useState<string>();
  const [removing, startRemove] = useTransition();
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.saved) {
      onDone?.();
      setFormKey((k) => k + 1); // clear the "add" form
    }
  }, [state.saved, onDone]);

  const idSuffix = source?.id ?? "new";
  return (
    <form key={formKey} action={action} className="grid gap-2">
      {source && <input type="hidden" name="id" value={source.id} />}
      <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
        <div>
          <label className={ui.label} htmlFor={`fund-name-${idSuffix}`}>
            Account
          </label>
          <input
            id={`fund-name-${idSuffix}`}
            name="name"
            className={ui.input}
            defaultValue={source?.name ?? ""}
            placeholder="e.g. Savings"
            maxLength={80}
            required
          />
        </div>
        <div>
          <label className={ui.label} htmlFor={`fund-amount-${idSuffix}`}>
            Amount
          </label>
          <input
            id={`fund-amount-${idSuffix}`}
            name="amount"
            className={`${ui.input} font-mono`}
            inputMode="decimal"
            defaultValue={source ? (source.amount_cents / 100).toLocaleString("en-US") : ""}
            placeholder="$"
            required
          />
        </div>
      </div>
      {(state.error || removeError) && (
        <p role="alert" className={ui.error}>
          {state.error ?? removeError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={ui.btn} disabled={pending}>
          {pending ? "Saving…" : source ? "Save" : "Add account"}
        </button>
        {source && (
          <>
            <button type="button" className={ui.ghost} onClick={onDone}>
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.danger} ml-auto`}
              disabled={removing}
              onClick={() => {
                if (!window.confirm(`Remove ${source.name}? It stays in the history.`)) return;
                startRemove(async () => {
                  const r = await removeFunding(source.id);
                  if (r.ok) onDone?.();
                  else setRemoveError(r.error);
                });
              }}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </form>
  );
}

/** The accounts paying for the project: names and amounts, not real accounts. */
export function FundingList({ sources, canEdit }: { sources: FundingSource[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid gap-2">
      {sources.length > 0 && (
        <ul className="divide-line border-line bg-paper divide-y rounded border">
          {sources.map((s) => (
            <li key={s.id} className="px-3 py-2.5">
              {editing === s.id ? (
                <AccountForm source={s} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{s.name}</span>
                  <span className="font-mono">{money(s.amount_cents)}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="text-accent min-h-9 pl-2 text-[13px] font-medium"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setEditing(s.id)}
                    >
                      Edit
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit &&
        (adding || sources.length === 0 ? (
          <div className="border-line rounded border border-dashed p-3">
            <AccountForm onDone={() => setAdding(false)} />
          </div>
        ) : (
          <button
            type="button"
            className="text-accent min-h-9 justify-self-start text-[13px] font-medium"
            onClick={() => setAdding(true)}
          >
            + Add an account
          </button>
        ))}
    </div>
  );
}
