// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, createUser } from "../../src/test/db";

let db: Client;
let drop: () => Promise<void>;
let owner: string, viewer: string, outsider: string;
let sample: string;

const one = async <T = Record<string, unknown>>(
  user: string | null,
  sql: string,
  args: unknown[] = [],
) => as(db, user, async (q) => (await q(sql, args)).rows[0] as T);
const all = async (user: string | null, sql: string, args: unknown[] = []) =>
  as(db, user, async (q) => (await q(sql, args)).rows);
const events = async (project: string) =>
  (
    await db.query(
      "select type, summary, before, after, reason from public.events where project_id = $1 order by created_at, id",
      [project],
    )
  ).rows;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  owner = await createUser(db, "drew@example.com", "Drew");
  viewer = await createUser(db, "val@example.com", "Val");
  outsider = await createUser(db, "out@example.com", "Out");
  sample = (await one<{ id: string }>(owner, "select public.load_sample_project() as id")).id;

  // Val joins the sample as a Viewer.
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await as(db, owner, (q) =>
    q("select public.create_invitation($1, 'val@example.com', 'viewer', $2)", [sample, hash]),
  );
  await as(db, viewer, (q) => q("select public.accept_invitation($1)", [hash]));
});

afterAll(async () => drop?.());

describe("milestones", () => {
  it("every new project gets the six standard milestones, without dates", async () => {
    const id = (await one<{ id: string }>(owner, "select public.create_project('Blank') as id")).id;
    const ms = await all(
      owner,
      "select key, date from public.milestones where project_id = $1 order by sort_order",
      [id],
    );
    expect(ms).toEqual([
      { key: "rough_in", date: null },
      { key: "drywall", date: null },
      { key: "cabinets", date: null },
      { key: "countertops", date: null },
      { key: "finish", date: null },
      { key: "move_in", date: null },
    ]);
  });
});

describe("sample project", () => {
  it("loads the documented record", async () => {
    const counts = await one(
      owner,
      `select
      (select count(*)::int from public.decisions where project_id = $1) as decisions,
      (select count(*)::int from public.decisions where project_id = $1 and milestone_key = 'rough_in') as rough_in,
      (select count(*)::int from public.decisions where project_id = $1 and status not in ('not_started','exploring')) as made,
      (select count(*)::int from public.budget_buckets where project_id = $1) as buckets,
      (select count(*)::int from public.ledger_entries where project_id = $1) as ledger,
      (select sum(budget_cents)::bigint from public.budget_buckets where project_id = $1) as total_budget`,
      [sample],
    );
    expect(counts).toEqual({
      decisions: 32,
      rough_in: 13,
      made: 12,
      buckets: 6,
      ledger: 6,
      total_budget: "34900000",
    });
    const rough = await one<{ days: number }>(
      owner,
      "select date - current_date as days from public.milestones where project_id = $1 and key = 'rough_in'",
      [sample],
    );
    expect(rough.days).toBe(24);
  });

  it("is invisible to people who aren't on it", async () => {
    expect(
      await all(outsider, "select 1 from public.decisions where project_id = $1", [sample]),
    ).toHaveLength(0);
    expect(
      await all(outsider, "select 1 from public.ledger_entries where project_id = $1", [sample]),
    ).toHaveLength(0);
  });
});

describe("update_decision", () => {
  const find = (title: string, room: string) =>
    one<{ id: string; status: string; selection: string | null }>(
      owner,
      "select id, status, selection from public.decisions where project_id = $1 and title = $2 and room = $3",
      [sample, title, room],
    );

  it("changes a status and logs one event with before and after", async () => {
    const tub = await find("Tub (freestanding or alcove)", "Primary bath");
    await as(db, owner, (q) =>
      q("select public.update_decision($1, $2)", [tub.id, { status: "decided" }]),
    );
    expect((await find("Tub (freestanding or alcove)", "Primary bath")).status).toBe("decided");
    expect((await events(sample)).at(-1)).toMatchObject({
      type: "decision",
      summary: "Tub (freestanding or alcove) (Primary bath) marked Decided",
      before: { status: "exploring" },
      after: { status: "decided" },
    });
  });

  it("keeps the earlier pick in history when a selection changes", async () => {
    const tile = await find("Bathroom floor tile", "Primary bath");
    await as(db, owner, (q) =>
      q("select public.update_decision($1, $2, $3)", [
        tile.id,
        { selection: "Basketweave marble", cost_cents: 420000 },
        "Kate preferred it",
      ]),
    );
    expect((await events(sample)).at(-1)).toMatchObject({
      summary: "Bathroom floor tile (Primary bath): picked Basketweave marble",
      before: { selection: "Hex Carrara marble mosaic", cost_cents: 390000 },
      after: { selection: "Basketweave marble", cost_cents: 420000 },
      reason: "Kate preferred it",
    });
  });

  it("writes nothing when nothing changes", async () => {
    const before = (await events(sample)).length;
    const tub = await find("Tub (freestanding or alcove)", "Primary bath");
    await as(db, owner, (q) =>
      q("select public.update_decision($1, $2)", [tub.id, { status: "decided" }]),
    );
    expect(await events(sample)).toHaveLength(before);
  });

  it("refuses viewers, outsiders and unknown fields", async () => {
    const tub = await find("Tub (freestanding or alcove)", "Primary bath");
    await expect(
      as(db, viewer, (q) =>
        q("select public.update_decision($1, $2)", [tub.id, { status: "ordered" }]),
      ),
    ).rejects.toThrow(/Only the owner or an editor/);
    await expect(
      as(db, outsider, (q) =>
        q("select public.update_decision($1, $2)", [tub.id, { status: "ordered" }]),
      ),
    ).rejects.toThrow(/Only the owner or an editor/);
    await expect(
      as(db, owner, (q) => q("select public.update_decision($1, $2)", [tub.id, { title: "x" }])),
    ).rejects.toThrow(/Can't change "title"/);
    await expect(
      as(db, owner, (q) =>
        q("select public.update_decision($1, $2)", [tub.id, { status: "done" }]),
      ),
    ).rejects.toThrow();
  });

  it("only links budget lines from the same project", async () => {
    const other = (await one<{ id: string }>(owner, "select public.load_sample_project() as id"))
      .id;
    const foreign = await one<{ id: string }>(
      owner,
      "select id from public.budget_buckets where project_id = $1 limit 1",
      [other],
    );
    const tub = await find("Tub (freestanding or alcove)", "Primary bath");
    await expect(
      as(db, owner, (q) =>
        q("select public.update_decision($1, $2)", [tub.id, { bucket_id: foreign.id }]),
      ),
    ).rejects.toThrow(/isn't on this project/);
  });
});

describe("move_milestone", () => {
  it("moves rough-in, returns the 13 deadlines that moved, and logs one event", async () => {
    const before = (await events(sample)).length;
    const moved = await all(
      owner,
      "select * from public.move_milestone($1, 'rough_in', current_date + 38, 'GC says plumber is two weeks behind')",
      [sample],
    );
    expect(moved).toHaveLength(13);
    for (const d of moved) {
      expect((d.new_decide_by as Date).getTime() - (d.old_decide_by as Date).getTime()).toBe(
        14 * 86_400_000,
      );
    }
    const ev = await events(sample);
    expect(ev).toHaveLength(before + 1);
    expect(ev.at(-1)).toMatchObject({
      type: "schedule",
      after: { deadlines_moved: 13 },
      reason: "GC says plumber is two weeks behind",
    });
    expect(ev.at(-1)!.summary).toMatch(
      /^Rough-in moved from \w{3} \d{1,2}, \d{4} to \w{3} \d{1,2}, \d{4} \(13 deadlines moved\)$/,
    );
    expect(ev.at(-1)!.before.date).not.toEqual(ev.at(-1)!.after.date);
  });

  it("does nothing when the date is unchanged", async () => {
    const before = (await events(sample)).length;
    expect(
      await all(owner, "select * from public.move_milestone($1, 'rough_in', current_date + 38)", [
        sample,
      ]),
    ).toHaveLength(0);
    expect(await events(sample)).toHaveLength(before);
  });

  it("refuses viewers", async () => {
    await expect(
      as(db, viewer, (q) =>
        q("select * from public.move_milestone($1, 'rough_in', current_date)", [sample]),
      ),
    ).rejects.toThrow(/Only the owner or an editor/);
  });
});

describe("direct writes", () => {
  it("are refused on every record table", async () => {
    for (const table of [
      "milestones",
      "decisions",
      "budget_buckets",
      "ledger_entries",
      "files",
      "photos",
    ]) {
      await expect(
        as(db, owner, (q) => q(`delete from public.${table} where project_id = $1`, [sample])),
        table,
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("funding sources", () => {
  const sources = (project: string) =>
    all(
      owner,
      "select name, amount_cents::bigint as amount from public.funding_sources where project_id = $1 and deleted_at is null order by sort_order",
      [project],
    );

  it("the sample project has two accounts totalling $290,000", async () => {
    expect(await sources(sample)).toEqual([
      { name: "Savings", amount: "9000000" },
      { name: "Home equity line of credit", amount: "20000000" },
    ]);
  });

  it("adds, changes and removes accounts, logging each with before and after", async () => {
    const id = (
      await one<{ id: string }>(
        owner,
        "select public.save_funding_source($1, null, ' Gift from parents ', 2500000) as id",
        [sample],
      )
    ).id;
    expect((await events(sample)).at(-1)).toMatchObject({
      type: "budget",
      summary: "Added Gift from parents: $25,000 for the project",
      after: { name: "Gift from parents", amount_cents: 2500000 },
    });

    await as(db, owner, (q) =>
      q("select public.save_funding_source($1, $2, 'Gift from parents', 3000000)", [sample, id]),
    );
    expect((await events(sample)).at(-1)).toMatchObject({
      summary: "Gift from parents changed from $25,000 to $30,000",
      before: { amount_cents: 2500000 },
      after: { amount_cents: 3000000 },
    });

    const count = (await events(sample)).length;
    await as(db, owner, (q) =>
      q("select public.save_funding_source($1, $2, 'Gift from parents', 3000000)", [sample, id]),
    );
    expect(await events(sample)).toHaveLength(count);

    await as(db, owner, (q) => q("select public.remove_funding_source($1, $2)", [sample, id]));
    expect((await events(sample)).at(-1)).toMatchObject({
      summary: "Removed Gift from parents ($30,000)",
    });
    expect(await sources(sample)).toHaveLength(2);
    // Soft delete: the row is still there.
    expect(
      await all(owner, "select 1 from public.funding_sources where id = $1", [id]),
    ).toHaveLength(1);
  });

  it("refuses viewers, bad input and other projects' accounts", async () => {
    await expect(
      as(db, viewer, (q) =>
        q("select public.save_funding_source($1, null, 'Savings', 100)", [sample]),
      ),
    ).rejects.toThrow(/Only the owner or an editor/);
    await expect(
      as(db, owner, (q) => q("select public.save_funding_source($1, null, '  ', 100)", [sample])),
    ).rejects.toThrow(/Give the account a name/);
    await expect(
      as(db, owner, (q) => q("select public.save_funding_source($1, null, 'X', -1)", [sample])),
    ).rejects.toThrow(/zero or more/);
    const other = (await one<{ id: string }>(owner, "select public.load_sample_project() as id"))
      .id;
    const foreign = await one<{ id: string }>(
      owner,
      "select id from public.funding_sources where project_id = $1 limit 1",
      [other],
    );
    await expect(
      as(db, owner, (q) =>
        q("select public.save_funding_source($1, $2, 'X', 1)", [sample, foreign.id]),
      ),
    ).rejects.toThrow(/isn't on this project/);
    await expect(
      as(db, owner, (q) => q("delete from public.funding_sources where project_id = $1", [sample])),
    ).rejects.toThrow(/permission denied/);
  });
});
