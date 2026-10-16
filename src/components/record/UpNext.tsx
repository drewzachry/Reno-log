"use client";

import Link from "next/link";
import { useState } from "react";
import type { UpNextItem } from "@/lib/record/upnext";

const tone = {
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  "": "bg-bg text-muted",
} as const;

/** The few things that matter now: three, or six when opened; the rest is on Decisions. */
export function UpNext({ items }: { items: UpNextItem[] }) {
  const [all, setAll] = useState(false);
  const shown = items.slice(0, all ? 6 : 3);
  return (
    <section aria-label="Up next" className="border-line bg-paper rounded border">
      <h2 className="font-display text-muted flex items-baseline justify-between px-3.5 pt-3 text-[12.5px] font-bold tracking-[.08em] uppercase [font-stretch:95%]">
        Up next
        {items.length > 0 && <span className="tabular-nums">{items.length}</span>}
      </h2>
      {shown.length ? (
        <ul className="divide-line mt-1 divide-y">
          {shown.map((i) => (
            <li key={i.text}>
              <Link
                href={i.href}
                className="flex min-h-12 items-center gap-3 px-3.5 py-2 text-[14px]"
              >
                <span
                  className={`w-[92px] flex-none rounded-full px-2 py-0.5 text-center text-[12px] font-semibold whitespace-nowrap ${tone[i.severity]}`}
                >
                  {i.when}
                </span>
                <span className="min-w-0 flex-1">{i.text}</span>
                <span aria-hidden="true" className="text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted px-3.5 pt-1 pb-3 text-[14px]">
          Nothing due in the next three weeks.
        </p>
      )}
      {items.length > 3 && !all && (
        <button
          type="button"
          className="border-line text-accent min-h-11 w-full border-t text-[13.5px] font-medium"
          onClick={() => setAll(true)}
        >
          Show {Math.min(items.length, 6) - 3} more
        </button>
      )}
      {all && (
        <div className="border-line flex border-t text-[13.5px] font-medium">
          <button
            type="button"
            className="text-muted min-h-11 flex-1"
            onClick={() => setAll(false)}
          >
            Show fewer
          </button>
          {items.length > 6 && (
            <Link
              href="/decisions"
              className="text-accent flex min-h-11 flex-1 items-center justify-center"
            >
              All deadlines ›
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
