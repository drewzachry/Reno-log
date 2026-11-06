"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "@/lib/projects";

const item = "flex min-h-11 w-full items-center px-3 text-left text-[15px] hover:bg-bg rounded";

/**
 * The prototype's header Menu: settings, new project, sign out. Switching
 * between several projects isn't possible yet now that Drive is the
 * database — there's no server-side list of "your projects" to show, so
 * `projects` is always at most one until a later phase adds a local
 * recently-opened list.
 */
export function HeaderMenu({
  projects,
  currentId,
}: {
  projects: ProjectSummary[];
  currentId: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        className="border-header-muted/50 text-header-ink inline-flex min-h-10 items-center rounded border px-3 text-[13px] font-medium hover:bg-white/10"
        aria-expanded={open}
        aria-controls="header-menu"
        onClick={() => setOpen((o) => !o)}
      >
        Menu
      </button>
      {open && (
        <div
          id="header-menu"
          className="border-line bg-paper absolute top-[calc(100%+4px)] right-0 z-30 grid w-64 gap-0.5 rounded border p-1.5 shadow-[0_8px_24px_color-mix(in_srgb,var(--ink)_18%,transparent)]"
        >
          {projects.find((p) => p.id === currentId)?.role !== "viewer" && (
            <Link href="/plan" className={item} onClick={() => setOpen(false)}>
              Set up from documents
            </Link>
          )}
          <Link href="/settings" className={item} onClick={() => setOpen(false)}>
            Project settings and people
          </Link>
          <Link href="/start" className={item} onClick={() => setOpen(false)}>
            Start a new project
          </Link>
          <form action="/auth/signout" method="post">
            <button className={`${item} text-muted`}>Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
