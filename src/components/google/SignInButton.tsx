"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/components/ui";

/**
 * Renders Google's own "Sign in with Google" button. On success, posts the
 * ID token to our server to start the session cookie, then navigates to
 * `next`. We never see the user's Google password or handle credentials
 * ourselves — Google's script does the whole flow in an iframe/popup.
 */
export function SignInButton({ clientId, next }: { clientId: string; next: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    function render() {
      if (cancelled) return;
      if (!window.google?.accounts?.id || !ref.current) {
        // The script loads async; try again shortly rather than racing it.
        if (attempts++ < 50) setTimeout(render, 100);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idToken: credential }),
          }).catch(() => null);
          if (!res?.ok) {
            setError("That sign-in didn't work. Please try again.");
            return;
          }
          router.push(next);
        },
      });
      window.google.accounts.id.renderButton(ref.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: 320,
      });
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [clientId, next, router]);

  return (
    <div>
      <div ref={ref} />
      {error && (
        <p role="alert" className={`${ui.error} mt-3`}>
          {error}
        </p>
      )}
    </div>
  );
}
