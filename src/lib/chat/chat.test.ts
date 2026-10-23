import { describe, expect, it } from "vitest";
import { withDeadlines } from "@/lib/record/deadlines";
import { sampleProject } from "@/lib/record/sample.fixture";
import { buildBriefing } from "./briefing";
import { buildCard, type CardContext } from "./cards";
import { parseToolCalls, TOOLS, type ToolCall } from "./tools";
import { pastTurns } from "./turns";

const today = "2026-10-16";
const s = sampleProject(today);
const ctx = (over: Partial<CardContext> = {}): CardContext => ({
  today,
  milestones: s.milestones,
  buckets: s.buckets,
  ledger: s.ledger,
  decisions: withDeadlines(s.decisions, s.milestones, today),
  facts: [{ fact: "Wants brushed nickel everywhere" }],
  imageFileIds: ["file-0", "file-1"],
  ...over,
});
const card = (name: string, input: Record<string, unknown>, c = ctx()) => {
  const { calls } = parseToolCalls([{ type: "tool_use", name, input }]);
  expect(calls).toHaveLength(1);
  return buildCard(calls[0] as ToolCall, c);
};
const invoice = {
  vendor: "Rivera Plumbing",
  date: "2026-10-10",
  amount_cents: 240000,
  bucket_id: "plumbing",
  description: "Rough-in second draw",
  kind: "invoice",
  paid: true,
  image_index: 0,
  flags: [],
};

describe("tool definitions", () => {
  it("are strict, with every property required and no extras", () => {
    for (const t of TOOLS) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
      expect(t.input_schema.required.sort()).toEqual(Object.keys(t.input_schema.properties).sort());
    }
  });
});

describe("parsing the assistant's tool calls", () => {
  it("keeps valid calls and ignores text and thinking blocks", () => {
    const { calls, rejected } = parseToolCalls([
      { type: "thinking" },
      { type: "text" },
      { type: "tool_use", name: "add_note", input: { text: "Electrician Monday", room: null } },
    ]);
    expect(rejected).toBe(0);
    expect(calls).toEqual([
      { name: "add_note", input: { text: "Electrician Monday", room: null } },
    ]);
  });

  it("drops unknown tools and malformed input", () => {
    const { calls, rejected } = parseToolCalls([
      { type: "tool_use", name: "delete_everything", input: {} },
      { type: "tool_use", name: "log_invoice", input: { ...invoice, amount_cents: -5 } },
      { type: "tool_use", name: "log_invoice", input: { ...invoice, amount_cents: 12.5 } },
      {
        type: "tool_use",
        name: "move_milestone",
        input: { milestone_key: "drywall", date: "Nov 23", reason: null },
      },
      { type: "tool_use", name: "add_note", input: { text: "x", room: null, extra: 1 } },
    ]);
    expect(calls).toHaveLength(1); // zod strips the extra key on add_note
    expect(rejected).toBe(4);
  });

  it("keeps at most five", () => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({
      type: "tool_use",
      name: "add_note",
      input: { text: `n${i}`, room: null },
    }));
    expect(parseToolCalls(blocks).calls).toHaveLength(5);
  });

  it("reads 'unchanged' status as no change", () => {
    const { calls } = parseToolCalls([
      {
        type: "tool_use",
        name: "update_decision",
        input: {
          decision_id: "d1",
          status: "unchanged",
          selection: " ",
          cost_cents: null,
          note: null,
        },
      },
    ]);
    expect(calls[0].input).toMatchObject({ status: null, selection: null });
  });
});

describe("cards", () => {
  it("an invoice card shows vendor, amount, date and budget line, and links the photo", () => {
    const c = card("log_invoice", invoice)!;
    expect(c.kind_label).toBe("Invoice");
    expect(c.summary).toBe("Rivera Plumbing · $2,400");
    expect(c.detail).toBe("Rough-in second draw\nOct 10 · Plumbing fixtures allowance");
    expect(c.payload).toMatchObject({
      file_id: "file-0",
      bucket_id: "plumbing",
      amount_cents: 240000,
    });
    expect(c.warnings).toEqual([]);
  });

  it("a bill not paid yet says so and is logged unpaid; a paid one isn't", () => {
    const bill = card("log_invoice", { ...invoice, paid: false })!;
    expect(bill.payload).toMatchObject({ kind: "invoice", unpaid: true });
    expect(bill.detail).toContain("Not paid yet");
    const receipt = card("log_invoice", invoice)!;
    expect(receipt.payload).toMatchObject({ unpaid: false });
    expect(receipt.detail).not.toContain("Not paid yet");
    // Payments and credits are always money that moved.
    expect(
      card("log_invoice", { ...invoice, kind: "payment", paid: false })!.payload,
    ).toMatchObject({ unpaid: false });
  });

  it("a payment that matches an unpaid invoice suggests marking that one paid", () => {
    const ledger = [
      ...s.ledger,
      {
        ...s.ledger[0],
        id: "x",
        kind: "invoice" as const,
        vendor: "Rivera Plumbing",
        amount_cents: 240000,
        date: "2026-10-03",
        unpaid: true,
      },
    ];
    const c = card("log_invoice", { ...invoice, kind: "payment", paid: true }, ctx({ ledger }))!;
    expect(c.warnings).toEqual([
      "Matches the unpaid invoice from Rivera Plumbing on Oct 3: mark that one paid instead?",
    ]);
  });

  it("warns when an invoice takes a budget line over", () => {
    // Plumbing: $9,500 budget, $6,890 of fixtures picked. Invoices pay for picked
    // items, so only money out beyond $9,500 is over.
    expect(card("log_invoice", { ...invoice, amount_cents: 700000 })!.warnings).toEqual([]);
    const c = card("log_invoice", { ...invoice, amount_cents: 1000000 })!;
    expect(c.warnings).toEqual(["Puts Plumbing fixtures allowance over by $500"]);
  });

  it("flags a likely duplicate", () => {
    const ledger = [
      ...s.ledger,
      {
        ...s.ledger[0],
        id: "x",
        vendor: "Rivera Plumbing",
        amount_cents: 240000,
        date: "2026-10-03",
      },
    ];
    const c = card("log_invoice", { ...invoice, flags: ["Possible duplicate"] }, ctx({ ledger }))!;
    expect(c.warnings).toEqual(["Same amount as Rivera Plumbing on Oct 3: a duplicate?"]);
  });

  it("drops an unknown budget line or photo rather than trusting it", () => {
    const c = card("log_invoice", { ...invoice, bucket_id: "nope", image_index: 7 })!;
    expect(c.payload).toMatchObject({ bucket_id: null, file_id: null });
    expect(c.detail).toContain("No budget line yet");
  });

  it("a tile sample updates the decision, shows the earlier pick and the overage", () => {
    // Primary bath floor tile: decided, $3,900. Tile allowance is already $1,250 over.
    const decisions = withDeadlines(
      s.decisions.map((x) =>
        x.title === "Bathroom floor tile" ? { ...x, selection: "Marble hex 1-inch" } : x,
      ),
      s.milestones,
      today,
    );
    const d = decisions.find((x) => x.title === "Bathroom floor tile")!;
    const c = card(
      "update_decision",
      {
        decision_id: d.id,
        status: "unchanged",
        selection: "Carrara hex 2-inch",
        cost_cents: 450000,
        note: "Sample picked up",
      },
      ctx({ decisions }),
    )!;
    expect(c.kind_label).toBe("Decision");
    expect(c.summary).toBe("Bathroom floor tile (Primary bath)");
    expect(c.payload).toEqual({
      decision_id: d.id,
      changes: { selection: "Carrara hex 2-inch", cost_cents: 450000 },
      note: "Sample picked up",
    });
    expect(c.detail).toContain("Replaces earlier pick: Marble hex 1-inch");
    expect(c.warnings).toEqual(["Tile allowance would be $1,850 over (now $1,250)"]);
  });

  it("drops a decision update for an unknown id or with nothing to change", () => {
    expect(
      card("update_decision", {
        decision_id: "zzz",
        status: "decided",
        selection: null,
        cost_cents: null,
        note: null,
      }),
    ).toBeNull();
    const d = s.decisions[0];
    expect(
      card("update_decision", {
        decision_id: d.id,
        status: d.status,
        selection: null,
        cost_cents: null,
        note: null,
      }),
    ).toBeNull();
  });

  it("a schedule card says how many deadlines move", () => {
    const c = card("move_milestone", {
      milestone_key: "drywall",
      date: "2026-11-23",
      reason: "Inspection delayed",
    })!;
    const dependent = s.decisions.filter((d) => d.milestone_key === "drywall");
    expect(c.kind_label).toBe("Schedule change");
    expect(c.summary).toBe("Walls close: Dec 7 → Nov 23");
    expect(c.detail).toMatch(new RegExp(`^Moves ${dependent.length} deadlines`));
    expect(c.warnings).toEqual([]);
  });

  it("a photo card needs an attached photo", () => {
    expect(
      card("add_photo", { image_index: 3, room: null, caption: "x", decision_id: null }),
    ).toBeNull();
    expect(
      card("add_photo", {
        image_index: 1,
        room: "Kitchen",
        caption: "Wall open",
        decision_id: null,
      })!.payload,
    ).toMatchObject({
      file_id: "file-1",
    });
  });

  it("doesn't propose remembering something already remembered", () => {
    expect(
      card("remember_fact", { fact: "wants brushed  nickel everywhere", category: "preference" }),
    ).toBeNull();
    expect(
      card("remember_fact", { fact: "Kate decides on tile", category: "person" })!.kind_label,
    ).toBe("Remember");
  });

  it("warns when a new decision is already on the list", () => {
    const c = card("add_decision", {
      title: "Shower wall tile",
      room: "Hall bath",
      category: "Tile",
      milestone_key: "finish",
      lead_weeks: 6,
      why: "Long lead.",
      bucket_id: "tile",
    })!;
    expect(c.warnings).toEqual(["You already have “Shower wall tile” for Hall bath"]);
  });
});

describe("briefing", () => {
  it("lists ids, budget lines with overages, money set aside and facts", () => {
    const b = buildBriefing({
      projectName: "Sample house",
      today,
      ...s,
      decisions: withDeadlines(s.decisions, s.milestones, today),
      facts: [{ fact: "Wants brushed nickel everywhere", category: "preference" }],
    });
    expect(b).toContain("Today: Friday, October 16, 2026 (2026-10-16)");
    expect(b).toContain("drywall | Walls close | 2026-12-07");
    expect(b).toContain(
      "tile | Tile allowance | allowance | $8,000 | $9,250 | $1,950 | $7,300 | $1,250 OVER",
    );
    expect(b).toContain(
      "plumbing | Plumbing fixtures allowance | allowance | $9,500 | $6,890 | $0 | $9,500 | $2,610",
    );
    expect(b).toContain("Total $290,000; still to pay $273,050; buffer $16,950");
    expect(b).toContain("- (preference) Wants brushed nickel everywhere");
    expect(b).toMatch(
      /d\d+ \| Primary bath \| Tub \(freestanding or alcove\) \| exploring \| rough_in/,
    );
  });
});

describe("past turns", () => {
  it("alternate, start with the person, and note cards and photos", () => {
    expect(
      pastTurns([
        { role: "assistant", text: "Hi!", author: null, fileCount: 0, cards: [] },
        { role: "user", text: "Here's the invoice", author: "Drew", fileCount: 1, cards: [] },
        { role: "user", text: "and another", author: "Kate", fileCount: 0, cards: [] },
        {
          role: "assistant",
          text: "Here's a card.",
          author: null,
          fileCount: 0,
          cards: [{ kind_label: "Invoice", summary: "Rivera · $2,400", state: "confirmed" }],
        },
      ]),
    ).toEqual([
      { role: "user", content: "Drew: Here's the invoice (attached 1 photo)\n\nKate: and another" },
      { role: "assistant", content: "Here's a card.\n[Cards: Invoice: Rivera · $2,400 (logged)]" },
    ]);
  });
});
