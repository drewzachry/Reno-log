export type Tab = {
  href: string;
  label: string;
  icon: "chat" | "decisions" | "schedule" | "budget" | "more";
};

/** Bottom tab bar on phones. Photos, Documents, History and settings live under More. */
export const TABS: readonly Tab[] = [
  { href: "/", label: "Chat", icon: "chat" },
  { href: "/decisions", label: "Decisions", icon: "decisions" },
  { href: "/schedule", label: "Schedule", icon: "schedule" },
  { href: "/budget", label: "Budget", icon: "budget" },
  { href: "/more", label: "More", icon: "more" },
];

/** The tab that owns a path: exact match for "/", prefix match for the rest. */
export function activeTab(pathname: string): Tab | undefined {
  if (pathname === "/") return TABS[0];
  const morePaths = ["/photos", "/documents", "/history", "/settings"];
  if (morePaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return TABS.find((t) => t.href === "/more");
  }
  return TABS.find(
    (t) => t.href !== "/" && (pathname === t.href || pathname.startsWith(`${t.href}/`)),
  );
}
