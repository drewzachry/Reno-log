"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import { buildPlan, type SetupFormState } from "@/lib/actions/setup";

type Defaults = Record<
  "scope" | "start_date" | "move_in" | "contract" | "cushion" | "allowances",
  string
>;

export function PlanForm({
  projectId,
  defaults,
  waiting,
}: {
  projectId: string;
  defaults: Defaults;
  waiting: number;
}) {
  const [state, action, pending] = useActionState(buildPlan, {} as SetupFormState);
  const v = { ...defaults, ...state.values };

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label className={ui.label} htmlFor="scope">
          What are you renovating?
        </label>
        <textarea
          id="scope"
          name="scope"
          rows={4}
          required
          defaultValue={v.scope}
          className={ui.input}
          placeholder="e.g. Full kitchen gut, two bathrooms, a rear addition with a mudroom, new windows on the back of the house."
        />
        <p className={`${ui.note} mt-1`}>Name the rooms the way you talk about them.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={ui.label} htmlFor="start_date">
            Construction start
          </label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            required
            defaultValue={v.start_date}
            className={ui.input}
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="move_in">
            Target move-in
          </label>
          <input
            id="move_in"
            name="move_in"
            type="date"
            defaultValue={v.move_in}
            className={ui.input}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={ui.label} htmlFor="contract">
            Contract price
          </label>
          <input
            id="contract"
            name="contract"
            inputMode="decimal"
            defaultValue={v.contract}
            placeholder="e.g. 285,000"
            className={ui.input}
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="cushion">
            Cushion set aside
          </label>
          <input
            id="cushion"
            name="cushion"
            inputMode="decimal"
            defaultValue={v.cushion}
            placeholder="e.g. 25,000"
            className={ui.input}
          />
        </div>
      </div>
      <div>
        <label className={ui.label} htmlFor="allowances">
          Allowances in your contract
        </label>
        <textarea
          id="allowances"
          name="allowances"
          rows={2}
          defaultValue={v.allowances}
          className={ui.input}
          placeholder="e.g. tile $9,000, plumbing fixtures $6,500, lighting $3,000"
        />
        <p className={`${ui.note} mt-1`}>
          An allowance is money the contract sets aside for things you pick, like tile or fixtures.
        </p>
      </div>
      {state.error && (
        <p role="alert" className={ui.error}>
          {state.error}
        </p>
      )}
      {waiting > 0 && (
        <p className={ui.note}>
          Waiting for {waiting} document{waiting === 1 ? "" : "s"} to finish reading, so the map
          matches your plans.
        </p>
      )}
      <button className={ui.btn} disabled={pending || waiting > 0}>
        {pending ? "Starting…" : "Build my decision map"}
      </button>
    </form>
  );
}
