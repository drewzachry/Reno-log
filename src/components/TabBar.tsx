"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab, TABS } from "@/lib/nav/tabs";
import { TabIcon } from "./TabIcon";

export function TabBar() {
  const pathname = usePathname();
  const current = activeTab(pathname);

  return (
    <nav
      aria-label="Main"
      className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((tab) => {
          const isActive = current?.href === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  isActive ? "text-accent" : "text-muted"
                }`}
              >
                <TabIcon name={tab.icon} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
