// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, createUser } from "../../src/test/db";

let db: Client;
let drop: () => Promise<void>;
let owner: string, viewer: string, outsider: string;
let sample: string;
let message: string;

const one = async <T = Record<string, unknown>>(
  user: string | null,
  sql: string,
  args: unknown[] = [],
) => as(db, user, async (q) => (await q(sql, args)).rows[0] as T);
const all = async (user: string | null, sql: string, args: unknown[] = []) =>
  as(db, user, async (q) => (await q(sql, args)).rows);

/** What the server does with the service role after an AI turn. */
async function propose(type: string, payload: object, project = sample) {
  const { rows } = await db.query(
    `insert into public.proposals (project_id, message_id, type, payload, kind_label, summary)
     values ($1, $2, $3, $4, 'Test', 'Test card') returning id`,
    [project, message, type, payload],
  );
  return rows[0].id as string;
}
const confirm = (user: string, id: string) =>
  one<{ r: Record<string, unknown> }>(user, "select public.confirm_proposal($1) as r", [id]);
const state = async (id: string) =>
  (await db.query("select state from public.proposals where id = $1", [id])).rows[0].state;
const lastEvent = async () =>
  (
    await db.query(
      "select type, summary, proposal_id, actor_id from public.events where project_id = $1 order by created_at desc, id desc limit 1",
      [sample],
    )
  ).rows[0];

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  owner = await createUser(db, "drew@example.com", "Drew");
  viewer = await createUser(db, "val@example.com", "Val");
  outsider = await createUser(db, "out@example.com", "Out");
  sample = (await one<{ id: string }>(owner, "select public.load_sample_project() as id")).id;
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await as(db, owner, (q) =>
    q("select public.create_invitation($1, 'val@example.com', 'viewer', $2)", [sample, hash]),
  );
  await as(db, viewer, (q) => q("select public.accept_invitation($1)", [hash]));
  message = (
    await one<{ id: string }>(owner, "select public.post_message($1, 'Hello') as id", [sample])
  ).id;
});

afterAll(async () => drop?.());

describe("messages", () => {
  it("any member can post, including viewers; outsiders can't", async () => {
    const v = await one<{ id: string }>(
      viewer,
      "select public.post_message($1, 'When is drywall?') as id",
      [sample],
    );
    expect(v.id).toBeTruthy();
    await expect(one(outsider, "select public.post_message($1, 'hi')", [sample])).rejects.toThrow(
      /not on this project/,
    );
  });

  it("refuses empty messages", async () => {
    await expect(one(owner, "select public.post_message($1, '   ')", [sample])).rejects.toThrow(
      /Write a message/,
    );
  });

  it("members read the chat; outsiders see nothing", async () => {
    expect(
      (await all(viewer, "select id from public.messages where project_id = $1", [sample])).length,
    ).toBeGreaterThan(0);
    expect(
      await all(outsider, "select id from public.messages where project_id = $1", [sample]),
    ).toEqual([]);
  });

  it("people can't write messages or proposals directly", async () => {
    await expect(
      one(
        owner,
        "insert into public.messages (project_id, role, text) values ($1, 'assistant', 'fake')",
        [sample],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(one(owner, "update public.proposals set state = 'confirmed'")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("files", () => {
  it("editors record files inside the project's folder only", async () => {
    const ok = await one<{ id: string }>(
      owner,
      "select public.record_file($1, $2, 'inv.jpg', 'image/jpeg', 1000, 'invoice') as id",
      [sample, `projects/${sample}/abc/inv.jpg`],
    );
    expect(ok.id).toBeTruthy();
    await expect(
      one(
        owner,
        "select public.record_file($1, 'projects/other/x.jpg', 'x', 'image/jpeg', 1, 'photo')",
        [sample],
      ),
    ).rejects.toThrow(/storage/);
    await expect(
      one(viewer, "select public.record_file($1, $2, 'x', 'image/jpeg', 1, 'photo')", [
        sample,
        `projects/${sample}/x.jpg`,
      ]),
    ).rejects.toThrow();
  });

  it("viewers can't attach photos to messages", async () => {
    const f = await one<{ id: string }>(
      owner,
      "select public.record_file($1, $2, 'p.jpg', 'image/jpeg', 1, 'photo') as id",
      [sample, `projects/${sample}/p.jpg`],
    );
    await expect(
      one(viewer, "select public.post_message($1, 'look', array[$2]::uuid[])", [sample, f.id]),
    ).rejects.toThrow();
    const m = await one<{ id: string }>(
      owner,
      "select public.post_message($1, '', array[$2]::uuid[]) as id",
      [sample, f.id],
    );
    expect(m.id).toBeTruthy();
  });
});

describe("confirming proposals", () => {
  it("logs an invoice with its event pointing back to the card", async () => {
    const bucket = (
      await db.query(
        "select id from public.budget_buckets where project_id = $1 and name = 'Plumbing fixtures allowance'",
        [sample],
      )
    ).rows[0].id;
    const id = await propose("log_invoice", {
      kind: "invoice",
      vendor: "Rivera Plumbing",
      date: "2026-10-10",
      amount_cents: 240000,
      description: "Rough-in second draw",
      bucket_id: bucket,
      file_id: null,
      flags: [],
    });
    const r = await confirm(owner, id);
    expect(r.r.ledger_entry_id).toBeTruthy();
    expect(await state(id)).toBe("confirmed");
    const e = await lastEvent();
    expect(e).toMatchObject({ type: "invoice", proposal_id: id, actor_id: owner });
    expect(e.summary).toBe(
      "Invoice logged: Rivera Plumbing $2,400 for Rough-in second draw (Plumbing fixtures allowance)",
    );
  });

  it("logs a bill as not paid yet, and editors can mark it paid and back", async () => {
    const id = await propose("log_invoice", {
      kind: "invoice",
      unpaid: true,
      vendor: "Oak & Sons",
      date: "2026-10-12",
      amount_cents: 500000,
      description: "Progress bill",
      bucket_id: null,
      file_id: null,
      flags: [],
    });
    const entry = (await confirm(owner, id)).r.ledger_entry_id as string;
    const row = async () =>
      (await db.query("select unpaid from public.ledger_entries where id = $1", [entry])).rows[0]
        .unpaid;
    expect(await row()).toBe(true);
    expect((await lastEvent()).summary).toBe(
      "Invoice logged: Oak & Sons $5,000 for Progress bill, not paid yet",
    );

    await expect(
      one(viewer, "select public.set_invoice_paid($1, true)", [entry]),
    ).rejects.toThrow();
    await one(owner, "select public.set_invoice_paid($1, true)", [entry]);
    expect(await row()).toBe(false);
    expect((await lastEvent()).summary).toBe("Invoice marked paid: Oak & Sons $5,000");
    await one(owner, "select public.set_invoice_paid($1, false)", [entry]);
    expect(await row()).toBe(true);
    expect((await lastEvent()).summary).toBe("Invoice marked not paid: Oak & Sons $5,000");
    // Marking it the way it already is writes nothing.
    const before = (await db.query("select count(*)::int n from public.events")).rows[0].n;
    await one(owner, "select public.set_invoice_paid($1, false)", [entry]);
    expect((await db.query("select count(*)::int n from public.events")).rows[0].n).toBe(before);
  });

  it("only invoices can be unpaid", async () => {
    const pay = (
      await db.query(
        "select id from public.ledger_entries where project_id = $1 and kind = 'payment' limit 1",
        [sample],
      )
    ).rows[0];
    expect(pay).toBeDefined();
    await expect(one(owner, "select public.set_invoice_paid($1, true)", [pay.id])).rejects.toThrow(
      /Only invoices/,
    );
    await expect(
      db.query("update public.ledger_entries set unpaid = true where id = $1", [pay.id]),
    ).rejects.toThrow(/ledger_unpaid_invoices_only/);
  });

  it("logs a change order as proposed", async () => {
    const id = await propose("log_change_order", {
      vendor: "Oak & Sons",
      date: null,
      amount_cents: 180000,
      description: "Add blocking for floating vanity",
      bucket_id: null,
      file_id: null,
      status: "proposed",
    });
    await confirm(owner, id);
    const { rows } = await db.query(
      "select kind, change_order_status from public.ledger_entries where description = 'Add blocking for floating vanity'",
    );
    expect(rows[0]).toEqual({ kind: "change_order", change_order_status: "proposed" });
  });

  it("updates a decision and keeps the old pick in history", async () => {
    const d = (
      await db.query(
        "select id from public.decisions where project_id = $1 and status = 'not_started' order by title limit 1",
        [sample],
      )
    ).rows[0].id;
    const id = await propose("update_decision", {
      decision_id: d,
      changes: { status: "exploring", selection: "Sample ordered" },
      note: "Tile sample ordered",
    });
    await confirm(owner, id);
    const row = (
      await db.query("select status, selection from public.decisions where id = $1", [d])
    ).rows[0];
    expect(row).toEqual({ status: "exploring", selection: "Sample ordered" });
    expect((await lastEvent()).proposal_id).toBe(id);
  });

  it("adds a decision, moves a milestone, remembers a fact and adds a note", async () => {
    const add = await propose("add_decision", {
      title: "Niche size",
      room: "Primary bath",
      category: "Tile",
      milestone_key: "rough_in",
      lead_weeks: 0,
      why: "Framed before drywall.",
      bucket_id: null,
    });
    expect((await confirm(owner, add)).r.decision_id).toBeTruthy();

    const move = await propose("move_milestone", {
      milestone_key: "drywall",
      date: "2026-12-07",
      reason: "Inspection delayed",
    });
    const moved = (await confirm(owner, move)).r.moved as unknown[];
    expect(Array.isArray(moved)).toBe(true);
    expect(
      (
        await db.query(
          "select date::text from public.milestones where project_id = $1 and key = 'drywall'",
          [sample],
        )
      ).rows[0].date,
    ).toBe("2026-12-07");

    const fact = await propose("remember_fact", {
      fact: "Wants brushed nickel fixtures",
      category: "preference",
    });
    await confirm(owner, fact);
    const f = (
      await all(
        viewer,
        "select fact, source_message_id, retired_at from public.project_facts where project_id = $1",
        [sample],
      )
    )[0];
    expect(f).toEqual({
      fact: "Wants brushed nickel fixtures",
      source_message_id: message,
      retired_at: null,
    });

    const note = await propose("add_note", { text: "Electrician starts Monday", room: null });
    await confirm(owner, note);
    expect((await lastEvent()).summary).toBe("Note: Electrician starts Monday");
  });

  it("files a photo", async () => {
    const f = await one<{ id: string }>(
      owner,
      "select public.record_file($1, $2, 'wall.jpg', 'image/jpeg', 1, 'photo') as id",
      [sample, `projects/${sample}/wall.jpg`],
    );
    const id = await propose("add_photo", {
      file_id: f.id,
      room: "Kitchen",
      caption: "Plumbing wall",
      decision_id: null,
    });
    expect((await confirm(owner, id)).r.photo_id).toBeTruthy();
    expect((await lastEvent()).summary).toBe("Photo filed: Kitchen · Plumbing wall");
  });

  it("viewers and outsiders can't log or skip cards", async () => {
    const id = await propose("add_note", { text: "x", room: null });
    await expect(confirm(viewer, id)).rejects.toThrow();
    await expect(confirm(outsider, id)).rejects.toThrow();
    await expect(one(viewer, "select public.dismiss_proposal($1)", [id])).rejects.toThrow();
    expect(await state(id)).toBe("pending");
  });

  it("a card is logged once; a skipped card can't be logged", async () => {
    const id = await propose("add_note", { text: "Once only", room: null });
    await confirm(owner, id);
    await expect(confirm(owner, id)).rejects.toThrow(/already logged/);
    const skip = await propose("add_note", { text: "Skip me", room: null });
    await one(owner, "select public.dismiss_proposal($1)", [skip]);
    expect(await state(skip)).toBe("dismissed");
    await expect(confirm(owner, skip)).rejects.toThrow(/already skipped/);
  });

  it("a card can't touch another project's records", async () => {
    const other = (await one<{ id: string }>(owner, "select public.create_project('Other') as id"))
      .id;
    const d = (
      await db.query("select id from public.decisions where project_id = $1 limit 1", [sample])
    ).rows[0].id;
    // A card on the other project that names this project's decision.
    const { rows } = await db.query(
      `insert into public.messages (project_id, role, text) values ($1, 'assistant', 'x') returning id`,
      [other],
    );
    const p = (
      await db.query(
        `insert into public.proposals (project_id, message_id, type, payload, kind_label, summary)
         values ($1, $2, 'update_decision', $3, 'x', 'x') returning id`,
        [other, rows[0].id, { decision_id: d, changes: { status: "decided" }, note: null }],
      )
    ).rows[0].id;
    await expect(confirm(owner, p)).rejects.toThrow(/isn't on this project/);
    expect(await state(p)).toBe("pending");
  });

  it("a failed apply leaves nothing behind", async () => {
    const before = (await db.query("select count(*)::int as n from public.events")).rows[0].n;
    const id = await propose("add_decision", {
      title: "Bad",
      room: null,
      category: null,
      milestone_key: "nope",
      lead_weeks: 0,
      why: null,
      bucket_id: null,
    });
    await expect(confirm(owner, id)).rejects.toThrow(/milestone/);
    expect((await db.query("select count(*)::int as n from public.events")).rows[0].n).toBe(before);
    expect(await state(id)).toBe("pending");
  });

  it("the write functions can't be called directly from the browser", async () => {
    await expect(
      one(owner, "select public.add_note($1, 'sneaky', null)", [sample]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("facts", () => {
  it("editors forget a fact; it stays in history", async () => {
    const id = (
      await db.query("select id from public.project_facts where project_id = $1 limit 1", [sample])
    ).rows[0].id;
    await expect(one(viewer, "select public.retire_fact($1)", [id])).rejects.toThrow();
    await one(owner, "select public.retire_fact($1)", [id]);
    const f = (await db.query("select retired_at from public.project_facts where id = $1", [id]))
      .rows[0];
    expect(f.retired_at).not.toBeNull();
    expect((await lastEvent()).summary).toBe("Forgot: Wants brushed nickel fixtures");
  });
});
