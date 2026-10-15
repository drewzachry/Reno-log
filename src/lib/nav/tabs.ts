export type Tab = {
  href: string;
  /** Full label, used on wider screens. */
  label: string;
  /** Short label for the phone tab bar, from the prototype. */
  short: string;
};

/** Tabs in prototype order. On phones they form the bottom tab bar. */
export const TABS: readonly Tab[] = [
  { href: "/", label: "Chat", short: "Chat" },
  { href: "/decisions", label: "Decisions", short: "Decide" },
  { href: "/schedule", label: "Schedule", short: "Dates" },
  { href: "/budget", label: "Budget", short: "Money" },
  { href: "/photos", label: "Photos", short: "Photos" },
  { href: "/documents", label: "Documents", short: "Docs" },
  { href: "/history", label: "History", short: "Log" },
];

/** The tab that owns a path: exact match for "/", prefix match for the rest. */
export function activeTab(pathname: string): Tab | undefined {
  if (pathname === "/") return TABS[0];
  return TABS.find(
    (t) => t.href !== "/" && (pathname === t.href || pathname.startsWith(`${t.href}/`)),
  );
}
