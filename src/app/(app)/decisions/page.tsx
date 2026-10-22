import Link from "next/link";
import { EmptyState, PageHeader, SectionTitle } from "@/components/page";
import { DecisionCard } from "@/components/record/DecisionCard";
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
  const made = decisions.filter((d) => CHOSEN.has(d.status)).length;
  const groups = groupDecisions(decisions, by, milestones);
  const editable = can.edit(current.role);
  const pct = decisions.length ? Math.round((made / decisions.length) * 100) : 0;

  return (
    <section>
      <PageHeader
        title="Decisions"
        lede="Deadlines come from the schedule. When a date moves, these move with it."
      >
        {decisions.length > 0 && (
          <div className="mt-3">
            <p className="text-[14px]">
              <b className="tabular-nums">{made}</b> of{" "}
              <span className="tabular-nums">{decisions.length}</span> made
            </p>
            <div className="bg-line mt-1 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
              <div className="bg-ok h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </PageHeader>

      {decisions.length > 0 && (
        <nav
          aria-label="Group decisions"
          className="border-line bg-paper flex rounded-full border p-0.5 md:inline-flex"
        >
          {GROUPS.map(([k, l]) => (
            <Link
              key={k}
              href={`/decisions?group=${k}`}
              aria-current={k === by ? "true" : undefined}
              className={`flex min-h-9 flex-1 items-center justify-center rounded-full px-3 text-[13.5px] whitespace-nowrap ${
                k === by ? "bg-ink text-paper font-semibold" : "text-muted"
              }`}
            >
              {l}
            </Link>
          ))}
        </nav>
      )}

      {decisions.length === 0 ? (
        <EmptyState>
          No decisions yet.{" "}
          {can.edit(current.role) ? (
            <>
              <Link href="/plan" className="text-accent font-semibold">
                Set up your project
              </Link>{" "}
              to build them from your contract and plans, or the chat will suggest them as you go.
            </>
          ) : (
            "The chat will suggest them as you go."
          )}
        </EmptyState>
      ) : (
        groups.map((g) => {
          const open = g.items.filter((d) => OPEN.has(d.status)).length;
          return (
            <div key={g.name}>
              <SectionTitle
                count={by === "deadline" ? g.items.length : `${open} open of ${g.items.length}`}
              >
                {g.name}
              </SectionTitle>
              {g.milestone?.explanation && (
                <p className="text-muted -mt-1 mb-2 max-w-[60ch] text-[13px]">
                  {g.milestone.explanation}
                </p>
              )}
              <div className="grid gap-2">
                {g.items.map((d) => (
                  <DecisionCard
                    key={d.id}
                    d={d}
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
