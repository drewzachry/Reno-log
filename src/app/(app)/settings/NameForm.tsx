"use client";

import { useActionState } from "react";
import { NameField } from "@/components/NameField";
import { ui } from "@/components/ui";
import { updateMyName, type NameState } from "@/lib/actions/profile";

export function NameForm({ name }: { name: string | null }) {
  const [state, action, pending] = useActionState(updateMyName, {} as NameState);
  return (
    <form action={action} className="grid gap-3">
      <NameField defaultValue={name} />
      {state.error && (
        <p role="alert" className={ui.error}>
          {state.error}
        </p>
      )}
      <button className={`${ui.ghost} justify-self-start`} disabled={pending}>
        {state.saved && !pending ? "Saved" : pending ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}
