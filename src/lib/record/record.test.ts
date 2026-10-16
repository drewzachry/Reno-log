import { describe, expect, it } from "vitest";
import { bucketStats, budgetTotals } from "./budget";
import { addDays, daysBetween, shortDate, todayIn } from "./dates";
import { decideBy, groupDecisions, withDeadlines } from "./deadlines";
import { money, parseMoney } from "./money";
import { sampleProject } from "./sample.fixture";
import { upNextItems } from "./upnext";

const TODAY = "2026-10-17";
const s = sampleProject(TODAY);
const ds = withDeadlines(s.decisions, s.milestones, TODAY);
const bucket = (id: string) => s.buckets.find((b) => b.id === id)!;
const stats = (id: string) => bucketStats(bucket(id), s.ledger, s.decisions);

describe("dates", () => {
  it("does calendar arithmetic across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-17", "2026-10-13")).toBe(-4);
  });

  it("is immune to daylight-saving changes", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
  });

  it("knows today in the person's time zone", () => {
    const lateEveningInLA = new Date("2026-10-18T05:30:00Z");
    expect(todayIn("America/Los_Angeles", lateEveningInLA)).toBe("2026-10-17");
    expect(todayIn("UTC", lateEveningInLA)).toBe("2026-10-18");
    expect(todayIn("Not/AZone", lateEveningInLA)).toBe("2026-10-18");
  });

  it("formats short dates", () => {
    expect(shortDate("2026-11-03")).toBe("Nov 3");
    expect(shortDate(null)).toBe("—");
  });
});

describe("decide-by", () => {
  const dates = { rough_in: "2026-11-10", drywall: null };

  it("is the milestone date minus the lead time", () => {
    expect(
      decideBy({ due_date_override: null, milestone_key: "rough_in", lead_weeks: 4 }, dates),
    ).toBe("2026-10-13");
  });

  it("uses the decision's own due date when it has one", () => {
    expect(
      decideBy(
        { due_date_override: "2026-10-01", milestone_key: "rough_in", lead_weeks: 4 },
        dates,
      ),
    ).toBe("2026-10-01");
  });

  it("is unknown until the milestone has a date", () => {
    expect(
      decideBy({ due_date_override: null, milestone_key: "drywall", lead_weeks: 1 }, dates),
    ).toBeNull();
    expect(
      decideBy({ due_date_override: null, milestone_key: "nope", lead_weeks: 1 }, dates),
    ).toBeNull();
  });

  it("moves every rough-in deadline when rough-in moves", () => {
    const later = s.milestones.map((m) =>
      m.key === "rough_in" ? { ...m, date: addDays(m.date!, 14) } : m,
    );
    const moved = withDeadlines(s.decisions, later, TODAY).filter(
      (d, i) => d.decideBy !== ds[i].decideBy,
    );
    expect(moved).toHaveLength(13);
    expect(moved.every((d) => d.milestone_key === "rough_in")).toBe(true);
  });
});

describe("sample project math", () => {
  it("has 12 of 32 decisions made", () => {
    expect(
      groupDecisions(ds, "deadline", s.milestones).find((g) => g.name === "Made")!.items,
    ).toHaveLength(12);
  });

  it("groups by deadline: 3 overdue, 6 in the next 3 weeks, 11 later", () => {
    const g = groupDecisions(ds, "deadline", s.milestones);
    expect(g.map((x) => [x.name, x.items.length])).toEqual([
      ["Overdue", 3],
      ["Next 3 weeks", 6],
      ["Later", 11],
      ["Made", 12],
    ]);
    expect(g[0].items.map((d) => `${d.title} (${d.room}) ${d.daysLeft}`)).toEqual([
      "Tub (freestanding or alcove) (Primary bath) -18",
      "Range hood type and CFM (Kitchen) -4",
      "Shower valve and trim (Hall bath) -4",
    ]);
  });

  it("groups by room and by stage", () => {
    expect(groupDecisions(ds, "room", s.milestones).map((g) => [g.name, g.items.length])).toEqual([
      ["Hall bath", 5],
      ["Kitchen", 8],
      ["Primary bath", 9],
      ["Whole house", 10],
    ]);
    expect(groupDecisions(ds, "stage", s.milestones).map((g) => [g.name, g.items.length])).toEqual([
      ["Before rough-in", 13],
      ["Before walls close", 4],
      ["Before cabinets in", 4],
      ["Before countertops templated", 2],
      ["Before finish work", 8],
      ["Before move-in", 1],
    ]);
  });

  it("budget totals: $349,000 budget, $77,200 paid, $26,100 cushion left", () => {
    const t = budgetTotals(s.buckets, s.ledger, s.decisions);
    expect([money(t.total), money(t.paid), money(t.cushionLeft)]).toEqual([
      "$349,000",
      "$77,200",
      "$26,100",
    ]);
  });

  it("counts chosen tile against the allowance before it's paid: $1,250 over", () => {
    expect(stats("tile")).toEqual({
      paid: 195000,
      changeOrders: 0,
      chosen: 925000,
      used: 925000,
      left: -125000,
    });
  });

  it("counts only approved change orders against the cushion", () => {
    expect(stats("cushion")).toMatchObject({
      paid: 0,
      changeOrders: 240000,
      used: 240000,
      left: 2610000,
    });
  });

  it("other buckets count money out only", () => {
    expect(stats("contract")).toMatchObject({ paid: 7125000, used: 7125000, left: 21375000 });
    expect(stats("appliances")).toMatchObject({
      paid: 400000,
      chosen: 1360000,
      used: 400000,
      left: 1000000,
    });
    expect(stats("plumbing")).toMatchObject({ chosen: 689000, used: 689000, left: 261000 });
  });

  it("credits reduce what's been paid", () => {
    const withCredit = [
      ...s.ledger,
      { ...s.ledger[0], id: "c", kind: "credit" as const, amount_cents: 50000 },
    ];
    expect(bucketStats(bucket("contract"), withCredit, s.decisions).paid).toBe(7075000);
  });

  it("Up next puts the tile overage first, then the most overdue decisions", () => {
    const items = upNextItems(ds, s.buckets, s.ledger);
    expect(items.slice(0, 4).map((i) => `${i.when} | ${i.text}`)).toEqual([
      "Now | Tile allowance is $1,250 over budget",
      "18d late | Decide: Tub (freestanding or alcove) (Primary bath)",
      "4d late | Decide: Range hood type and CFM (Kitchen)",
      "4d late | Decide: Shower valve and trim (Hall bath)",
    ]);
    // The kitchen sink was decided 4 days after its deadline but not ordered.
    expect(items[4].text).toBe("Place the order: Kitchen sink and faucet (Kitchen)");
    expect(items).toHaveLength(11);
  });

  it("Up next nags about decided-but-not-ordered items past their deadline", () => {
    const later = addDays(TODAY, 15); // the appliance package (10 wk lead) is now 5 days late
    const items = upNextItems(withDeadlines(s.decisions, s.milestones, later), s.buckets, s.ledger);
    expect(items.map((i) => i.text)).toContain(
      "Place the order: Appliance package (models) (Kitchen)",
    );
  });

  it("Up next counts cards waiting for confirmation", () => {
    expect(upNextItems([], [], [], 2)[0].text).toBe(
      "2 updates waiting for you to confirm in the chat",
    );
  });
});

describe("money", () => {
  it("formats cents as whole dollars", () => {
    expect(money(125000)).toBe("$1,250");
    expect(money(-125000)).toBe("−$1,250");
    expect(money(null)).toBe("$0");
  });

  it("parses what people type", () => {
    expect(parseMoney("$3,900")).toBe(390000);
    expect(parseMoney("1250.5")).toBe(125050);
    expect(parseMoney("about 3k")).toBeNull();
  });
});
