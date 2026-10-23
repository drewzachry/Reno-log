import { describe, expect, it } from "vitest";
import {
  assemblePlan,
  DETAILS_SCHEMA,
  expandLibrary,
  normalizePlan,
  planSchema,
  previewPlan,
  SKELETON_SCHEMA,
  type LibraryRow,
  type Plan,
} from "./plan";

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
    check(SKELETON_SCHEMA);
    check(DETAILS_SCHEMA);
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

const library: LibraryRow[] = [
  {
    category: "Plumbing fixtures",
    title: "Shower valve and trim",
    area: "bath",
    milestone_key: "rough_in",
    lead_weeks: 4,
    why: "In the wall.",
  },
  {
    category: "Plumbing fixtures",
    title: "Tub filler and faucet",
    area: "bath",
    milestone_key: "rough_in",
    lead_weeks: 4,
    why: "Pipes.",
  },
  {
    category: "Kitchen layout",
    title: "Island size and seating",
    area: "kitchen",
    milestone_key: "rough_in",
    lead_weeks: 2,
    why: "Power.",
  },
  {
    category: "Paint",
    title: "Paint colors and sheens",
    area: "whole",
    milestone_key: "finish",
    lead_weeks: 2,
    why: "Schedule.",
  },
  {
    category: "Exterior",
    title: "Gutters and downspouts",
    area: "exterior",
    milestone_key: "finish",
    lead_weeks: 3,
    why: "Water.",
  },
];

describe("building the full list", () => {
  const rooms = [
    { name: "Primary bath", area: "bath" as const },
    { name: "Hall bath", area: "bath" as const },
    { name: "Kitchen", area: "kitchen" as const },
  ];

  it("gives every bathroom every bathroom decision, whole-house ones once, exterior only when there's exterior work", () => {
    const base = expandLibrary(library, rooms);
    expect(base.map((d) => `${d.title} | ${d.room}`)).toEqual([
      "Shower valve and trim | Primary bath",
      "Shower valve and trim | Hall bath",
      "Tub filler and faucet | Primary bath",
      "Tub filler and faucet | Hall bath",
      "Island size and seating | Kitchen",
      "Paint colors and sheens | Whole house",
    ]);
    expect(
      expandLibrary(library, [...rooms, { name: "Siding", area: "exterior" }]).at(-1),
    ).toMatchObject({
      title: "Gutters and downspouts",
      room: "Exterior",
    });
  });

  it("applies the model's changes by number and adds its extras", () => {
    const base = expandLibrary(library, rooms);
    const p = assemblePlan(
      {
        scope: "Two baths and a kitchen",
        milestones: plan().milestones,
        buckets: plan().buckets,
        rooms,
      },
      base,
      {
        skip: [4],
        decided: [{ n: 1, selection: "Delta Trinsic, brushed nickel", source: "Specs p.3" }],
        links: [
          { n: 2, bucket_key: "tile" },
          { n: 3, bucket_key: "nope" },
        ],
        extra: [decision({ title: "Shower niche", room: "Hall bath" })],
      },
    );
    expect(p.decisions.map((d) => [d.title, d.room, d.status, d.bucket_key])).toEqual([
      ["Shower valve and trim", "Primary bath", "decided", null],
      ["Shower valve and trim", "Hall bath", "not_started", "tile"],
      ["Tub filler and faucet", "Primary bath", "not_started", null],
      ["Island size and seating", "Kitchen", "not_started", null],
      ["Paint colors and sheens", "Whole house", "not_started", null],
      ["Shower niche", "Hall bath", "not_started", null],
    ]);
    expect(p.decisions[0]).toMatchObject({
      selection: "Delta Trinsic, brushed nickel",
      source: "Specs p.3",
    });
  });
});
