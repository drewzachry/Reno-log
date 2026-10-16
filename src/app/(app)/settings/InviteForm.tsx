"use client";

import { useActionState, useState } from "react";
import { ui } from "@/components/ui";
import { invitePerson, type InviteState } from "@/lib/actions/people";

export function InviteForm({ projectName }: { projectName: string }) {
  const [state, action, pending] = useActionState(invitePerson, { ok: false } as InviteState);
  const [copied, setCopied] = useState(false);

  async function share(link: string) {
    const text = `Join ${projectName} on Reno Logbook`;
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url: link });
        return;
      } catch {
        // Cancelled or unavailable: fall through to copying.
      }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="grid gap-3">
      <form action={action} className="grid gap-3" key={state.ok ? state.link : "form"}>
        <div>
          <label className={ui.label} htmlFor="invite-email">
            Their email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            className={ui.input}
            required
          />
        </div>
        <fieldset>
          <legend className={ui.label}>What they can do</legend>
          <div className="grid gap-2">
            <label className="border-line bg-paper flex min-h-11 items-start gap-3 rounded border p-3">
              <input type="radio" name="role" value="editor" defaultChecked className="mt-1" />
              <span>
                <b>Editor</b>
                <span className="text-muted block text-sm">
                  Can chat, log changes, upload and invite others. Best for a spouse or partner.
                </span>
              </span>
            </label>
            <label className="border-line bg-paper flex min-h-11 items-start gap-3 rounded border p-3">
              <input type="radio" name="role" value="viewer" className="mt-1" />
              <span>
                <b>Viewer</b>
                <span className="text-muted block text-sm">
                  Can see everything and ask questions, but can’t change anything.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
        {!state.ok && state.error && (
          <p role="alert" className={ui.error}>
            {state.error}
          </p>
        )}
        <button className={ui.btn} disabled={pending}>
          {pending ? "Creating invite…" : "Invite"}
        </button>
      </form>

      {state.ok && (
        <div className={`${ui.ok} grid gap-2`} role="status">
          <p>
            {state.emailed
              ? `We emailed an invite to ${state.email}. You can also send them this link yourself:`
              : `Invite ready. Send ${state.email} this link by text or email:`}
          </p>
          <code className="bg-paper block rounded px-2 py-1.5 font-mono text-xs break-all">
            {state.link}
          </code>
          <button type="button" className={ui.btn} onClick={() => share(state.link)}>
            {copied ? "Copied" : "Share or copy link"}
          </button>
          <p className="text-muted text-xs">
            The link works for 14 days. They must sign in with {state.email}.
          </p>
        </div>
      )}
    </div>
  );
}
