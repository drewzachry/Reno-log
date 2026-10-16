// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, createUser } from "../../src/test/db";

let db: Client;
let drop: () => Promise<void>;
let owner: string, viewer: string, outsider: string;
let project: string;

const one = async <T = Record<string, unknown>>(
  user: string | null,
  sql: string,
  args: unknown[] = [],
) => as(db, user, async (q) => (await q(sql, args)).rows[0] as T);
const all = async (user: string | null, sql: string, args: unknown[] = []) =>
  as(db, user, async (q) => (await q(sql, args)).rows);

async function upload(name: string) {
  const f = await one<{ id: string }>(
    owner,
    "select public.record_file($1, $2, $3, 'application/pdf', 1000, 'document') as id",
    [project, `projects/${project}/docs/${name}`, name],
  );
  return f.id;
}

/** What the reader does when it finishes, with the service role. */
async function finish(doc: string) {
  await db.query(
    `insert into public.document_chunks (document_id, project_id, page, seq, text) values
       ($1, $2, 4, 1, 'Exclusions: painting, landscaping and appliances are excluded from this contract.'),
       ($1, $2, 7, 2, 'Primary shower is 42 by 60 inches with a linear drain.')`,
    [doc, project],
  );
  await db.query("update public.documents set status = 'ready' where id = $1", [doc]);
}

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  owner = await createUser(db, "drew@example.com", "Drew");
  viewer = await createUser(db, "val@example.com", "Val");
  outsider = await createUser(db, "out@example.com", "Out");
  project = (await one<{ id: string }>(owner, "select public.create_project('House') as id")).id;
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await as(db, owner, (q) =>
    q("select public.create_invitation($1, 'val@example.com', 'viewer', $2)", [project, hash]),
  );
  await as(db, viewer, (q) => q("select public.accept_invitation($1)", [hash]));
});

afterAll(async () => drop?.());

describe("documents", () => {
  it("editors add a document, which queues a reading job; viewers and outsiders can't", async () => {
    const file = await upload("contract.pdf");
    const doc = (
      await one<{ id: string }>(owner, "select public.add_document($1, $2, 'Contract') as id", [
        project,
        file,
      ])
    ).id;
    const row = (
      await db.query("select status, progress from public.documents where id = $1", [doc])
    ).rows[0];
    expect(row).toEqual({ status: "reading", progress: "Waiting to start" });
    const jobs = (
      await db.query("select type, status from public.jobs where payload ->> 'document_id' = $1", [
        doc,
      ])
    ).rows;
    expect(jobs).toEqual([{ type: "read_document", status: "queued" }]);

    await expect(
      one(viewer, "select public.add_document($1, $2, 'x')", [project, file]),
    ).rejects.toThrow();
    await expect(
      one(outsider, "select public.add_document($1, $2, 'x')", [project, file]),
    ).rejects.toThrow();
  });

  it("members read documents; outsiders and the browser never see jobs", async () => {
    expect(
      (await all(viewer, "select id from public.documents where project_id = $1", [project]))
        .length,
    ).toBe(1);
    expect(
      await all(outsider, "select id from public.documents where project_id = $1", [project]),
    ).toEqual([]);
    await expect(all(owner, "select id from public.jobs")).rejects.toThrow(/permission denied/);
    await expect(one(owner, "select public.claim_job()")).rejects.toThrow(/permission denied/);
  });

  it("claims each due job once", async () => {
    const a = await db.query("select * from public.claim_job()");
    expect(a.rows[0].status).toBe("running");
    const b = await db.query("select id from public.claim_job()");
    expect(b.rows[0].id).toBeNull();
    // A runner that stopped: its lock runs out and the job is picked up again.
    await db.query("update public.jobs set locked_until = now() - interval '1 minute'");
    const c = await db.query("select * from public.claim_job()");
    expect(c.rows[0]).toMatchObject({ id: a.rows[0].id, attempts: 2 });
  });

  it("search finds passages with any of the question's words, ready documents only", async () => {
    const doc = (await db.query("select id from public.documents where project_id = $1", [project]))
      .rows[0].id;
    expect(
      await all(viewer, "select * from public.search_documents($1, 'What is excluded?')", [
        project,
      ]),
    ).toEqual([]);
    await finish(doc);
    const hits = await all(viewer, "select title, page from public.search_documents($1, $2)", [
      project,
      "What's excluded from my contract?",
    ]);
    expect(hits[0]).toEqual({ title: "Contract", page: 4 });
    const shower = await all(viewer, "select page from public.search_documents($1, $2)", [
      project,
      "What size is the primary shower?",
    ]);
    expect(shower[0]).toEqual({ page: 7 });
    expect(
      await all(outsider, "select * from public.search_documents($1, 'shower')", [project]),
    ).toEqual([]);
    expect(
      await all(viewer, "select * from public.search_documents($1, '?? the a')", [project]),
    ).toEqual([]);
  });

  it("retry only after a failure, and it clears what was read", async () => {
    const doc = (await db.query("select id from public.documents where project_id = $1", [project]))
      .rows[0].id;
    await db.query("update public.documents set status = 'failed', error = 'x' where id = $1", [
      doc,
    ]);
    await expect(one(viewer, "select public.retry_document($1)", [doc])).rejects.toThrow();
    await one(owner, "select public.retry_document($1)", [doc]);
    const row = (await db.query("select status, error from public.documents where id = $1", [doc]))
      .rows[0];
    expect(row).toEqual({ status: "reading", error: null });
    expect(
      (
        await db.query(
          "select count(*)::int n from public.document_chunks where document_id = $1",
          [doc],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it("removing is a soft delete with a history event, and stops its job", async () => {
    const doc = (await db.query("select id from public.documents where project_id = $1", [project]))
      .rows[0].id;
    await expect(one(viewer, "select public.remove_document($1)", [doc])).rejects.toThrow();
    await one(owner, "select public.remove_document($1)", [doc]);
    expect(
      (await db.query("select deleted_at from public.documents where id = $1", [doc])).rows[0]
        .deleted_at,
    ).not.toBeNull();
    const e = (
      await db.query(
        "select summary from public.events where project_id = $1 and type = 'document'",
        [project],
      )
    ).rows;
    expect(e).toEqual([{ summary: "Document removed: Contract" }]);
    const open = await db.query(
      "select count(*)::int n from public.jobs where payload ->> 'document_id' = $1 and status in ('queued','running')",
      [doc],
    );
    expect(open.rows[0].n).toBe(0);
  });
});
