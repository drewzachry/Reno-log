"use client";

import { useActionState } from "react";
import { NameField } from "@/components/NameField";
import { ui } from "@/components/ui";
import { acceptInvite } from "@/lib/actions/invites";

export function AcceptForm({ token, name }: { token: string; name: string | null }) {
  const [state, action, pending] = useActionState(acceptInvite, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <NameField defaultValue={name} />
      {state.error && (
        <p role="alert" className={ui.error}>
          {state.error}
        </p>
      )}
      <button className={ui.btn} disabled={pending}>
        {pending ? "Joining…" : "Join the project"}
      </button>
    </form>
  );
}
