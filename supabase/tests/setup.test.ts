// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, createUser } from "../../src/test/db";

let db: Client;
let drop: () => Promise<void>;
let owner: string, viewer: string;
let blank: string, sample: string;

const one = async <T = Record<string, unknown>>(
  user: string | null,
  sql: string,
  args: unknown[] = [],
) => as(db, user, async (q) => (await q(sql, args)).rows[0] as T);

const ANSWERS = {
  scope: "Kitchen and primary bath",
  start_date: "2026-11-02",
  move_in: "2027-04-30",
};
const PLAN = {
  scope: "Kitchen and primary bath remodel",
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
    { key: "cushion", name: "Cushion", kind: "contingency", budget_cents: 2850000 },
  ],
  decisions: [
    {
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
    },
    {
      title: "Shower wall tile",
      room: "Primary bath",
      category: "Tile",
      milestone_key: "finish",
      lead_weeks: 6,
      why: "Special order.",
      bucket_key: "tile",
      status: "decided",
      selection: "Zellige 2x6 white",
      source: "Specs p.4",
    },
  ],
};

/** What the server does when the AI's draft is ready. */
async function ready(project: string, plan = PLAN) {
  const id = (
    await one<{ id: string }>(owner, "select public.request_setup($1, $2) as id", [
      project,
      ANSWERS,
    ])
  ).id;
  await db.query("update public.setup_plans set status = 'ready', plan = $2 where id = $1", [
    id,
    plan,
  ]);
  return id;
}

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  owner = await createUser(db, "drew@example.com", "Drew");
  viewer = await createUser(db, "val@example.com", "Val");
  blank = (await one<{ id: string }>(owner, "select public.create_project('45 Earle') as id")).id;
  sample = (await one<{ id: string }>(owner, "select public.load_sample_project() as id")).id;
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await as(db, owner, (q) =>
    q("select public.create_invitation($1, 'val@example.com', 'viewer', $2)", [blank, hash]),
  );
  await as(db, viewer, (q) => q("select public.accept_invitation($1)", [hash]));
});

afterAll(async () => drop?.());

describe("decision library", () => {
  it("is seeded and readable by anyone signed in", async () => {
    const r = await one<{ n: number; baths: number }>(
      viewer,
      "select count(*)::int n, count(*) filter (where area = 'bath')::int baths from public.decision_library",
    );
    expect(r.n).toBe(62);
    expect(r.baths).toBeGreaterThan(10);
  });
});

describe("setup", () => {
  it("needs the scope and a start date, and only editors can ask", async () => {
    await expect(
      one(owner, "select public.request_setup($1, $2)", [
        blank,
        { scope: "", start_date: "2026-11-02" },
      ]),
    ).rejects.toThrow(/what you're renovating/);
    await expect(
      one(owner, "select public.request_setup($1, $2)", [blank, { scope: "Kitchen" }]),
    ).rejects.toThrow(/start date/);
    await expect(
      one(viewer, "select public.request_setup($1, $2)", [blank, ANSWERS]),
    ).rejects.toThrow();
  });

  it("queues a job, and a new request sets the old draft aside", async () => {
    const first = (
      await one<{ id: string }>(owner, "select public.request_setup($1, $2) as id", [
        blank,
        ANSWERS,
      ])
    ).id;
    const second = (
      await one<{ id: string }>(owner, "select public.request_setup($1, $2) as id", [
        blank,
        ANSWERS,
      ])
    ).id;
    const plans = (
      await db.query(
        "select id, status from public.setup_plans where project_id = $1 order by created_at",
        [blank],
      )
    ).rows;
    expect(plans).toEqual([
      { id: first, status: "discarded" },
      { id: second, status: "building" },
    ]);
    const jobs = (
      await db.query(
        "select status from public.jobs where type = 'build_setup' and payload ->> 'plan_id' = $1",
        [second],
      )
    ).rows;
    expect(jobs).toEqual([{ status: "queued" }]);
  });

  it("saves a ready plan to a new project, with one history event", async () => {
    const id = await ready(blank);
    await expect(one(viewer, "select public.apply_setup($1)", [id])).rejects.toThrow();
    const r = await one<{ r: unknown }>(owner, "select public.apply_setup($1) as r", [id]);
    expect(r.r).toEqual({ decisions: 2, buckets: 3, dates: 6, skipped: 0 });

    const tile = (
      await db.query(
        `select d.status, d.selection, d.source, b.name as bucket from public.decisions d
         join public.budget_buckets b on b.id = d.bucket_id
         where d.project_id = $1 and d.title = 'Shower wall tile'`,
        [blank],
      )
    ).rows[0];
    expect(tile).toEqual({
      status: "decided",
      selection: "Zellige 2x6 white",
      source: "Specs p.4",
      bucket: "Tile allowance",
    });
    const drywall = (
      await db.query(
        "select date::text from public.milestones where project_id = $1 and key = 'drywall'",
        [blank],
      )
    ).rows[0];
    expect(drywall.date).toBe("2027-01-04");
    const project = (
      await db.query(
        "select scope, start_date::text, target_move_in::text from public.projects where id = $1",
        [blank],
      )
    ).rows[0];
    expect(project).toEqual({
      scope: "Kitchen and primary bath",
      start_date: "2026-11-02",
      target_move_in: "2027-04-30",
    });
    const events = (
      await db.query(
        "select type, summary from public.events where project_id = $1 and type = 'setup' and summary like 'Project set up%'",
        [blank],
      )
    ).rows;
    expect(events).toEqual([
      { type: "setup", summary: "Project set up: 2 decisions, 3 budget lines, 6 dates" },
    ]);

    await expect(one(owner, "select public.apply_setup($1)", [id])).rejects.toThrow(
      /already saved/,
    );
  });

  it("only adds to a project that already has things: dates, budget lines and decisions are kept", async () => {
    const before = (
      await db.query(
        "select key, date::text from public.milestones where project_id = $1 order by key",
        [sample],
      )
    ).rows;
    const decisions = Number(
      (await db.query("select count(*) n from public.decisions where project_id = $1", [sample]))
        .rows[0].n,
    );
    const id = await ready(sample);
    const r = await one<{ r: unknown }>(owner, "select public.apply_setup($1) as r", [id]);
    // The sample already has both decisions and all three budget lines.
    expect(r.r).toEqual({ decisions: 0, buckets: 0, dates: 0, skipped: 2 });
    expect(
      (
        await db.query(
          "select key, date::text from public.milestones where project_id = $1 order by key",
          [sample],
        )
      ).rows,
    ).toEqual(before);
    expect(
      Number(
        (await db.query("select count(*) n from public.decisions where project_id = $1", [sample]))
          .rows[0].n,
      ),
    ).toBe(decisions);
    const tile = (
      await db.query(
        "select budget_cents from public.budget_buckets where project_id = $1 and name = 'Tile allowance'",
        [sample],
      )
    ).rows;
    expect(tile).toEqual([{ budget_cents: "800000" }]);
  });

  it("a set-aside plan can't be saved", async () => {
    const id = await ready(blank);
    await one(owner, "select public.discard_setup($1)", [id]);
    await expect(one(owner, "select public.apply_setup($1)", [id])).rejects.toThrow(
      /already set aside/,
    );
  });
});
