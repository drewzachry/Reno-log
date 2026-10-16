"use client";

import { useActionState } from "react";
import { NameField } from "@/components/NameField";
import { ui } from "@/components/ui";
import { createProject } from "@/lib/actions/projects";

export function StartForm({ askName, name }: { askName: boolean; name: string | null }) {
  const [state, action, pending] = useActionState(createProject, {});
  return (
    <form action={action} className="grid gap-3">
      {askName && <NameField defaultValue={name} />}
      <label className={ui.label} htmlFor="name">
        Project name
      </label>
      <input
        id="name"
        name="name"
        className={ui.input}
        placeholder="e.g. Maple Street renovation"
        maxLength={120}
        required
      />
      {state.error && (
        <p role="alert" className={ui.error}>
          {state.error}
        </p>
      )}
      <button className={ui.btn} disabled={pending}>
        {pending ? "Starting…" : "Start the project"}
      </button>
    </form>
  );
}
