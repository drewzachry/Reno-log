"use client";

import Link from "next/link";
import { useState } from "react";
import type { UpNextItem } from "@/lib/record/upnext";

const tone = { bad: "text-bad", warn: "text-warn", "": "text-muted" } as const;

/** The 2–4 most urgent things, as at the top of the prototype's chat. */
export function UpNext({ items }: { items: UpNextItem[] }) {
  const [all, setAll] = useState(false);
  const shown = items.slice(0, all ? 4 : 2);
  return (
    <section aria-label="Up next" className="border-line bg-paper rounded border px-3.5 py-3">
      <p className="font-display text-muted text-[11.5px] font-bold tracking-[.09em] uppercase [font-stretch:90%]">
        Up next{items.length > 4 ? ` · ${items.length} items` : ""}
      </p>
      {shown.length ? (
        <ul className="mt-1.5 grid gap-1">
          {shown.map((i) => (
            <li key={i.text}>
              <Link href={i.href} className="flex min-h-9 items-baseline gap-2 text-[13.5px]">
                <span
                  className={`w-[74px] flex-none font-mono text-xs font-medium ${tone[i.severity]}`}
                >
                  {i.when}
                </span>
                <span>{i.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted mt-1 text-sm">Nothing due in the next three weeks.</p>
      )}
      {items.length > 2 && (
        <button
          type="button"
          className="text-accent min-h-9 pt-1 text-[13px] font-medium"
          onClick={() => setAll((a) => !a)}
        >
          {all ? "Show less" : `Show ${Math.min(items.length, 4)}`}
        </button>
      )}
    </section>
  );
}
