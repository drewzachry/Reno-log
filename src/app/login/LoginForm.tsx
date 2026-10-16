"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import { sendCode, verifyCode, type LoginState } from "@/lib/auth/actions";

export function LoginForm({ next }: { next: string }) {
  const [sent, send, sending] = useActionState(sendCode, { step: "email" } as LoginState);
  const [checked, check, checking] = useActionState(verifyCode, {
    step: "code",
    email: "",
  } as LoginState);

  if (sent.step === "code") {
    return (
      <div className="grid gap-3">
        <form action={check} className="grid gap-3">
          <p>
            We emailed a sign-in code to <b>{sent.email}</b>.
          </p>
          <p className={ui.note}>
            Type the code here. The link in the email works too, but on an iPhone it may open in
            Safari instead of this app.
          </p>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={next} />
          <label className={ui.label} htmlFor="code">
            Code from the email
          </label>
          <input
            id="code"
            name="code"
            className={`${ui.input} font-mono tracking-[.3em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={12}
            required
            autoFocus
          />
          {checked.error && (
            <p role="alert" className={ui.error}>
              {checked.error}
            </p>
          )}
          <button className={ui.btn} disabled={checking}>
            {checking ? "Checking…" : "Sign in"}
          </button>
        </form>
        <form action={send}>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={next} />
          <button className={`${ui.ghost} w-full`} disabled={sending}>
            Send a new code
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={send} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <label className={ui.label} htmlFor="email">
        Your email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        className={ui.input}
        autoComplete="email"
        inputMode="email"
        defaultValue={sent.email}
        required
      />
      {sent.error && (
        <p role="alert" className={ui.error}>
          {sent.error}
        </p>
      )}
      <button className={ui.btn} disabled={sending}>
        {sending ? "Sending…" : "Email me a sign-in code"}
      </button>
      <p className={ui.note}>No password needed. New here? This creates your account.</p>
    </form>
  );
}
