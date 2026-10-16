import Link from "next/link";
import { DecisionCard } from "@/components/record/DecisionCard";
import { ui } from "@/components/ui";
import { getSession } from "@/lib/projects";
import { groupDecisions } from "@/lib/record/deadlines";
import { loadRecord } from "@/lib/record/load";
import { CHOSEN, OPEN } from "@/lib/record/types";
import { can } from "@/lib/roles";

export const metadata = { title: "Decisions" };

const GROUPS = [
  ["deadline", "By deadline"],
  ["room", "By room"],
  ["stage", "By stage"],
] as const;
type GroupBy = (typeof GROUPS)[number][0];

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { group } = await searchParams;
  const by: GroupBy = GROUPS.some(([k]) => k === group) ? (group as GroupBy) : "deadline";
  const { decisions, milestones, buckets } = await loadRecord(supabase, current.id);
  const label = Object.fromEntries(milestones.map((m) => [m.key, m.label]));
  const made = decisions.filter((d) => CHOSEN.has(d.status)).length;
  const groups = groupDecisions(decisions, by, milestones);
  const editable = can.edit(current.role);

  return (
    <section>
      <h1 className={ui.h1}>Decisions</h1>
      <p className="text-muted mb-2.5 max-w-[62ch]">
        <span className="font-mono">
          {made} of {decisions.length}
        </span>{" "}
        made. Deadlines are worked back from the schedule, so when a date moves, these move with it.
      </p>
      <nav
        aria-label="Group decisions"
        className="border-line my-1.5 flex overflow-hidden rounded border md:inline-flex"
      >
        {GROUPS.map(([k, l]) => (
          <Link
            key={k}
            href={`/decisions?group=${k}`}
            aria-current={k === by ? "true" : undefined}
            className={`flex min-h-[38px] flex-1 items-center justify-center px-2.5 text-[13px] ${
              k === by ? "bg-ink text-paper" : ""
            }`}
          >
            {l}
          </Link>
        ))}
      </nav>

      {decisions.length === 0 ? (
        <p className="border-line text-muted mt-3 rounded border border-dashed p-4 text-[13.5px]">
          No decisions yet. Soon you’ll be able to build them from your contract and plans, or tell
          the chat about your project and it will suggest them.
        </p>
      ) : (
        groups.map((g) => {
          const open = g.items.filter((d) => OPEN.has(d.status)).length;
          return (
            <div key={g.name}>
              <h2 className="font-display text-muted mt-[18px] mb-1.5 flex justify-between gap-2 text-[13px] font-bold tracking-[.07em] uppercase [font-stretch:95%]">
                <span>{g.name}</span>
                <span className="font-mono">
                  {by === "deadline" ? g.items.length : `${open} open / ${g.items.length}`}
                </span>
              </h2>
              {g.milestone?.explanation && (
                <p className="text-muted mb-2 max-w-[62ch] text-[13px]">
                  {g.milestone.explanation}
                </p>
              )}
              <div className="grid gap-1.5">
                {g.items.map((d) => (
                  <DecisionCard
                    key={d.id}
                    d={d}
                    milestoneLabel={label[d.milestone_key] ?? d.milestone_key}
                    bucket={buckets.find((b) => b.id === d.bucket_id)}
                    canEdit={editable}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
