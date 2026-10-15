import type { Tab } from "@/lib/nav/tabs";

const PATHS: Record<Tab["icon"], string> = {
  chat: "M4 5h16v11H8l-4 4V5z",
  decisions: "M9 11l2 2 4-4M5 4h14v16H5z",
  schedule: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  budget: "M3 7h18v12H3zM3 11h18M7 15h3",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

export function TabIcon({ name }: { name: Tab["icon"] }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
