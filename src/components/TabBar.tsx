"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab, TABS } from "@/lib/nav/tabs";

/** Bottom tab bar on phones; a row of tabs under the header on wider screens. */
export function TabBar() {
  const current = activeTab(usePathname());

  return (
    <nav
      aria-label="Main"
      className="border-line bg-paper order-last flex-none border-t px-[max(4px,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] md:order-none md:mx-[max(16px,env(safe-area-inset-left))] md:border-t-0 md:border-b md:bg-transparent md:px-0 md:pb-0"
    >
      <ul className="grid grid-cols-7 md:flex md:gap-0.5">
        {TABS.map((tab) => {
          const isActive = current?.href === tab.href;
          return (
            <li key={tab.href} className="min-w-0">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`font-display flex h-14 items-center justify-center border-t-[3px] px-0.5 text-[11.5px] font-semibold tracking-[.03em] uppercase [font-stretch:95%] md:h-auto md:border-t-0 md:border-b-[3px] md:px-2.5 md:py-2 md:text-[13.5px] md:tracking-[.04em] ${
                  isActive ? "border-accent text-ink" : "text-muted border-transparent"
                }`}
              >
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
