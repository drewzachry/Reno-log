"use client";

import { useEffect } from "react";
import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";

/**
 * Shown instead of a blank "Application error" page. The usual cause on a
 * phone is a new version deployed while the page was open, which a reload fixes.
 */
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    // A page from before a deploy calling an action the new version doesn't
    // have: reload once to get the new page. The flag stops a reload loop.
    const stale =
      error.name === "UnrecognizedActionError" ||
      /Server Action .* was not found/.test(error.message);
    try {
      if (stale && !sessionStorage.getItem("reno-reloaded")) {
        sessionStorage.setItem("reno-reloaded", "1");
        window.location.reload();
        return;
      }
      sessionStorage.removeItem("reno-reloaded");
    } catch {
      // Storage blocked: just show the Reload button.
    }
  }, [error]);

  return (
    <PlainShell>
      <h1 className={ui.h1}>Something went wrong</h1>
      <p className="text-muted mt-2 mb-5">
        Reloading usually fixes this, especially if the app was just updated. Nothing you entered
        has been lost from your project.
      </p>
      <button type="button" className={`${ui.btn} w-full`} onClick={() => window.location.reload()}>
        Reload
      </button>
      {error.digest && (
        <p className="text-muted mt-6 text-center font-mono text-xs">Error code {error.digest}</p>
      )}
    </PlainShell>
  );
}
