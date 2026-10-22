import { describe, expect, it } from "vitest";
import { normalizePlan, PLAN_SCHEMA, planSchema, previewPlan, type Plan } from "./plan";

const decision = (over: Partial<Plan["decisions"][number]> = {}): Plan["decisions"][number] => ({
  title: "Shower valve and trim",
  room: "Primary bath",
  category: "Plumbing fixtures",
  milestone_key: "rough_in",
  lead_weeks: 4,
  why: "Set in the wall at rough-in.",
  bucket_key: null,
  status: "not_started",
  selection: null,
  source: null,
  ...over,
});
const plan = (over: Partial<Plan> = {}): Plan => ({
  scope: "Kitchen and two baths",
  milestones: {
    rough_in: "2026-12-01",
    drywall: "2027-01-04",
    cabinets: "2027-02-01",
    countertops: "2027-02-22",
    finish: "2027-03-15",
    move_in: "2027-04-30",
  },
  buckets: [
    { key: "contract", name: "Construction contract", kind: "contract", budget_cents: 28500000 },
    { key: "tile", name: "Tile allowance", kind: "allowance", budget_cents: 900000 },
  ],
  decisions: [decision()],
  ...over,
});

describe("plan schema", () => {
  it("is strict enough for structured output", () => {
    const check = (s: Record<string, unknown>): void => {
      if (s.type === "object" || (Array.isArray(s.type) && s.type.includes("object"))) {
        expect(s.additionalProperties).toBe(false);
        const props = s.properties as Record<string, Record<string, unknown>>;
        expect((s.required as string[]).sort()).toEqual(Object.keys(props).sort());
        Object.values(props).forEach(check);
      }
      if (s.items) check(s.items as Record<string, unknown>);
    };
    check(PLAN_SCHEMA);
  });

  it("rejects a draft with bad dates or no decisions", () => {
    expect(planSchema.safeParse(plan()).success).toBe(true);
    expect(
      planSchema.safeParse(plan({ milestones: { ...plan().milestones, drywall: "January" } }))
        .success,
    ).toBe(false);
    expect(planSchema.safeParse(plan({ decisions: [] })).success).toBe(false);
  });
});

describe("tidying a draft", () => {
  it("keeps stage dates in order", () => {
    const p = normalizePlan(
      plan({
        milestones: { ...plan().milestones, cabinets: "2027-01-01", countertops: "2027-01-02" },
      }),
    );
    expect(p.milestones.cabinets).toBe("2027-01-11");
    expect(p.milestones.countertops).toBe("2027-01-18");
  });

  it("drops duplicates, unknown budget lines and a 'decided' without a pick", () => {
    const p = normalizePlan(
      plan({
        buckets: [
          ...plan().buckets,
          { key: "tile2", name: "tile allowance", kind: "allowance", budget_cents: 1 },
        ],
        decisions: [
          decision({ bucket_key: "nope" }),
          decision({ title: "shower valve  and trim" }),
          decision({ title: "Grout color", status: "decided", selection: null }),
          decision({
            title: "Floor tile",
            status: "decided",
            selection: "Hex marble",
            source: "Specs p.4",
            bucket_key: "tile",
          }),
        ],
      }),
    );
    expect(p.buckets.map((b) => b.key)).toEqual(["contract", "tile"]);
    expect(p.decisions.map((d) => [d.title, d.status, d.bucket_key])).toEqual([
      ["Shower valve and trim", "not_started", null],
      ["Grout color", "not_started", null],
      ["Floor tile", "decided", "tile"],
    ]);
  });
});

describe("preview", () => {
  it("counts only what saving would add", () => {
    const v = previewPlan(
      plan({
        decisions: [
          decision(),
          decision({ title: "Floor tile", status: "decided", selection: "Hex" }),
        ],
      }),
      {
        milestones: [
          { key: "rough_in", label: "Rough-in", date: "2026-11-20" },
          { key: "drywall", label: "Walls close", date: null },
        ],
        buckets: [{ name: "construction contract", kind: "contract", budget_cents: 1 }],
        decisions: [{ title: "Shower Valve and Trim", room: "primary bath" }],
      },
    );
    expect(v.dates[0]).toEqual({
      key: "rough_in",
      label: "Rough-in",
      planned: "2026-12-01",
      kept: "2026-11-20",
    });
    expect(v.counts).toEqual({ decisions: 1, decided: 1, buckets: 1, dates: 5 });
    expect(v.skipped).toBe(1);
    expect(v.buckets.map((b) => b.exists)).toEqual([true, false]);
  });
});
