import Link from "next/link";

export const metadata = { title: "More" };

const LINKS = [
  { href: "/photos", label: "Photos", hint: "Progress and sample photos" },
  { href: "/documents", label: "Documents", hint: "Plans, contract, specs" },
  { href: "/history", label: "History", hint: "Every change, who and why" },
];

export default function MorePage() {
  return (
    <section className="px-4 pt-6">
      <h1 className="font-display text-2xl font-semibold">More</h1>
      <ul className="divide-line border-line bg-surface mt-4 divide-y overflow-hidden rounded-xl border">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-14 flex-col justify-center px-4 py-3">
              <span className="font-medium">{l.label}</span>
              <span className="text-muted text-sm">{l.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
