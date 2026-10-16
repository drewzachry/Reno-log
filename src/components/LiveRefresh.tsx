"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the screen current when someone else changes the project. Every
 * change writes a history event, so Realtime on this project's events (plus
 * chat messages and cards) is enough. Also refreshes when the app comes back to the
 * foreground, in case the connection slept while the phone was locked.
 */
export function LiveRefresh({ projectId }: { projectId: string }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (Date.now() - hiddenAt > 5000) refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let cleanup = () => {};
    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`project-${projectId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "events",
            filter: `project_id=eq.${projectId}`,
          },
          refresh,
        )
        // Chat replies and cards logged or skipped on another phone.
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `project_id=eq.${projectId}`,
          },
          refresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "proposals",
            filter: `project_id=eq.${projectId}`,
          },
          refresh,
        )
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    } catch {
      // Realtime unavailable: the foreground refresh still keeps things current.
    }

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      cleanup();
    };
  }, [projectId, router]);

  return null;
}
