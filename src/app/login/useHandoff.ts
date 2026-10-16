"use client";

import { useEffect, useState } from "react";

/**
 * While the "check your email" screen is open, asks the server every few
 * seconds (and whenever the app comes back to the foreground) whether the
 * email link has been opened elsewhere. On success, goes to `next`.
 */
export function useHandoff(next: string, active: boolean) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let busy = false;
    const started = Date.now();

    async function check() {
      if (stopped || busy || document.visibilityState === "hidden") return;
      if (Date.now() - started > 15 * 60_000) return;
      busy = true;
      try {
        const res = await fetch("/auth/handoff", { method: "POST", cache: "no-store" });
        const { status } = (await res.json()) as { status: string };
        if (status === "signed-in") {
          stopped = true;
          window.location.assign(next);
        } else if (status === "failed") {
          stopped = true;
          setFailed(true);
        }
      } catch {
        // Offline for a moment; try again on the next tick.
      } finally {
        busy = false;
      }
    }

    const timer = setInterval(check, 2500);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [active, next]);

  return { failed };
}
