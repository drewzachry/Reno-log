"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { switchProject } from "@/lib/actions/projects";
import { loadSampleProject } from "@/lib/actions/record";
import type { ProjectSummary } from "@/lib/projects";
import { ui } from "./ui";

const item = "flex min-h-11 w-full items-center px-3 text-left text-[15px] hover:bg-bg rounded";

/** The prototype's header Menu: switch project, settings, new project, sign out. */
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
          {projects.length > 1 && (
            <>
              <p className={`${ui.eyebrow} px-3 pt-1.5 pb-1`}>Your projects</p>
              {projects.map((p) => (
                <form key={p.id} action={switchProject}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <button className={item} aria-current={p.id === currentId ? "true" : undefined}>
                    <span className="truncate">{p.name}</span>
                    {p.id === currentId && <span className="text-accent ml-auto pl-2">✓</span>}
                  </button>
                </form>
              ))}
              <hr className="border-line my-1" />
            </>
          )}
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
          {!projects.some((p) => p.name.endsWith("(sample)")) && (
            <form action={loadSampleProject}>
              <button className={item}>Explore the sample project</button>
            </form>
          )}
          <form action="/auth/signout" method="post">
            <button className={`${item} text-muted`}>Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
