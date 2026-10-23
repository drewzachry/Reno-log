"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import { sendCode, verifyCode, type LoginState } from "@/lib/auth/actions";
import { useHandoff } from "./useHandoff";

export function LoginForm({ next }: { next: string }) {
  const [sent, send, sending] = useActionState(sendCode, { step: "email" } as LoginState);
  const [checked, check, checking] = useActionState(verifyCode, {
    step: "code",
    email: "",
  } as LoginState);
  // The email link may open in Safari rather than this app; this picks it up.
  const { failed } = useHandoff(next, sent.step === "code");

  if (sent.step === "code") {
    return (
      <div className="grid gap-3">
        <h2 className="text-lg font-extrabold">Check your email</h2>
        <p>
          We sent a sign-in link to <b>{sent.email}</b>. Tap it, then come back here. This screen
          carries on by itself.
        </p>
        {failed && (
          <p role="alert" className={ui.error}>
            That link didn’t work. It may have expired. Send a new one below.
          </p>
        )}
        <form action={send}>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={next} />
          <button className={`${ui.ghost} w-full`} disabled={sending}>
            {sending ? "Sending…" : "Send a new link"}
          </button>
        </form>

        <details className="border-line bg-paper mt-4 rounded border p-3">
          <summary className="text-muted min-h-8 cursor-pointer text-sm">
            Got a code instead of a link?
          </summary>
          <form action={check} className="mt-3 grid gap-3">
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
        </details>
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
        {sending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className={ui.note}>No password needed. New here? This creates your account.</p>
    </form>
  );
}
