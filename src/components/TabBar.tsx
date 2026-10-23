"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { activeTab, TABS } from "@/lib/nav/tabs";

/**
 * Bottom tab bar on phones; a row of tabs under the header on wider screens.
 * A tapped tab lights up at once and pulses while
 * its page loads from the server.
 */
export function TabBar() {
  const pathname = usePathname();
  const current = activeTab(pathname);
  const [tapped, setTapped] = useState<string | null>(null);
  useEffect(() => setTapped(null), [pathname]);
  const shown = tapped ?? current?.href;

  return (
    <nav
      aria-label="Main"
      className="border-line bg-paper order-last flex-none border-t px-[max(4px,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] md:order-none md:mx-[max(16px,env(safe-area-inset-left))] md:border-t-0 md:border-b md:bg-transparent md:px-0 md:pb-0"
    >
      <ul className="grid grid-cols-7 md:flex md:gap-0.5">
        {TABS.map((tab) => {
          const isActive = shown === tab.href;
          const loading = tapped === tab.href;
          return (
            <li key={tab.href} className="relative min-w-0">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  if (tab.href !== current?.href) setTapped(tab.href);
                }}
                className={`flex h-[58px] flex-col items-center justify-center gap-[3px] border-t-[3px] px-0.5 text-[10px] tracking-[.3px] md:h-auto md:flex-row md:border-t-0 md:border-b-[3px] md:px-3 md:py-2.5 md:text-[13.5px] md:font-semibold md:tracking-[.04em] md:uppercase ${
                  isActive
                    ? "border-ink text-ink font-bold"
                    : "text-muted border-transparent font-normal"
                } ${loading ? "animate-pulse" : ""}`}
              >
                <span aria-hidden="true" className="text-[19px] leading-none md:hidden">
                  {tab.icon}
                </span>
                <span className="md:hidden">{tab.short}</span>
                <span className="hidden md:inline">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
