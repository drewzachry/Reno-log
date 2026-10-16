// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, createUser } from "../../src/test/db";

let db: Client;
let drop: () => Promise<void>;
let drew: string, kate: string, val: string, stranger: string;
let project: string;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

async function invite(by: string, email: string, role: string) {
  const token = newToken();
  await as(db, by, (q) =>
    q("select public.create_invitation($1, $2, $3, $4)", [project, email, role, hash(token)]),
  );
  return token;
}
const accept = (user: string, token: string) =>
  as(db, user, (q) => q("select public.accept_invitation($1) as id", [hash(token)]));
const visibleProjects = (user: string) =>
  as(db, user, async (q) => (await q("select id from public.projects")).rows.length);
const events = async () =>
  (
    await db.query(
      "select type, summary, before, after, actor_id from public.events where project_id = $1 order by created_at, id",
      [project],
    )
  ).rows;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  drew = await createUser(db, "Drew@Example.com", "Drew");
  kate = await createUser(db, "kate@example.com", "Kate");
  val = await createUser(db, "val@example.com", "Val");
  stranger = await createUser(db, "someone@example.com");
  project = await as(
    db,
    drew,
    async (q) => (await q("select public.create_project('Rivera renovation') as id")).rows[0].id,
  );
});

afterAll(async () => drop?.());

describe("profiles", () => {
  it("are created on sign-up with a lowercased email", async () => {
    const { rows } = await db.query(
      "select email, display_name from public.profiles where id = $1",
      [drew],
    );
    expect(rows[0]).toEqual({ email: "drew@example.com", display_name: "Drew" });
  });
});

describe("creating a project", () => {
  it("makes the creator the owner and logs one event", async () => {
    const role = await as(
      db,
      drew,
      async (q) => (await q("select public.project_role($1) as r", [project])).rows[0].r,
    );
    expect(role).toBe("owner");
    const ev = await events();
    expect(ev[0]).toMatchObject({
      type: "setup",
      actor_id: drew,
      summary: 'Started the project "Rivera renovation"',
    });
  });

  it("is invisible to people who aren't members", async () => {
    expect(await visibleProjects(stranger)).toBe(0);
    const seen = await as(db, stranger, async (q) => ({
      members: (await q("select 1 from public.project_members")).rows.length,
      events: (await q("select 1 from public.events")).rows.length,
      invites: (await q("select 1 from public.invitations")).rows.length,
    }));
    expect(seen).toEqual({ members: 0, events: 0, invites: 0 });
  });

  it("cannot be done signed out", async () => {
    await expect(as(db, null, (q) => q("select public.create_project('x')"))).rejects.toThrow();
  });
});

describe("direct writes", () => {
  it("are refused for every table, even for the owner", async () => {
    for (const sql of [
      "insert into public.projects (name, owner_id) values ('x', auth.uid())",
      `insert into public.project_members (project_id, user_id, role) values ('${project}', '${stranger}', 'editor')`,
      `insert into public.events (project_id, type, summary) values ('${project}', 'note', 'x')`,
      `update public.projects set name = 'x' where id = '${project}'`,
      `delete from public.project_members where project_id = '${project}'`,
    ]) {
      await expect(
        as(db, drew, (q) => q(sql)),
        sql,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("can't change or delete history, even as the database owner", async () => {
    await expect(db.query("update public.events set summary = 'x'")).rejects.toThrow(
      /History can't be changed/,
    );
    await expect(db.query("delete from public.events")).rejects.toThrow(/History can't be changed/);
  });
});

describe("invitations", () => {
  it("lets the owner invite an editor who accepts with the matching email", async () => {
    const token = await invite(drew, " KATE@example.com ", "editor");
    const preview = await as(
      db,
      null,
      async (q) => (await q("select * from public.get_invitation($1)", [hash(token)])).rows[0],
    );
    expect(preview).toEqual({
      project_name: "Rivera renovation",
      inviter_name: "Drew",
      email_hint: "k***@example.com",
      role: "editor",
      status: "pending",
    });

    const { rows } = await accept(kate, token);
    expect(rows[0].id).toBe(project);
    expect(await visibleProjects(kate)).toBe(1);
    const ev = await events();
    expect(ev.at(-1)).toMatchObject({
      type: "member",
      actor_id: kate,
      summary: "Kate joined as Editor",
    });
  });

  it("rejects a different email with a plain-English message", async () => {
    const token = await invite(drew, "val@example.com", "viewer");
    await expect(accept(stranger, token)).rejects.toThrow(
      "This invite was sent to v***@example.com. Sign in with that email, or ask Drew to invite this address.",
    );
    expect(await visibleProjects(stranger)).toBe(0);
    await accept(val, token);
    expect(await visibleProjects(val)).toBe(1);
  });

  it("refuses expired and revoked invites", async () => {
    const expired = await invite(drew, "someone@example.com", "viewer");
    await db.query(
      "update public.invitations set expires_at = now() - interval '1 day' where token_hash = $1",
      [hash(expired)],
    );
    await expect(accept(stranger, expired)).rejects.toThrow(/expired/);

    const revoked = await invite(drew, "someone@example.com", "viewer");
    const { rows } = await db.query("select id from public.invitations where token_hash = $1", [
      hash(revoked),
    ]);
    await as(db, drew, (q) => q("select public.revoke_invitation($1)", [rows[0].id]));
    await expect(accept(stranger, revoked)).rejects.toThrow(/cancelled/);
    expect(await visibleProjects(stranger)).toBe(0);
  });

  it("replaces a pending invite when the same email is invited again", async () => {
    const first = await invite(drew, "someone@example.com", "viewer");
    const second = await invite(drew, "someone@example.com", "editor");
    await expect(accept(stranger, first)).rejects.toThrow(/cancelled/);
    await accept(stranger, second);
    const role = await as(
      db,
      stranger,
      async (q) => (await q("select public.project_role($1) as r", [project])).rows[0].r,
    );
    expect(role).toBe("editor");
    await as(db, drew, (q) => q("select public.remove_member($1, $2)", [project, stranger]));
  });

  it("refuses inviting someone already on the project", async () => {
    await expect(invite(drew, "kate@example.com", "viewer")).rejects.toThrow(
      /already on this project/,
    );
  });

  it("lets an editor invite, but never a viewer", async () => {
    await expect(invite(kate, "new@example.com", "viewer")).resolves.toBeTypeOf("string");
    await expect(invite(val, "other@example.com", "viewer")).rejects.toThrow(
      /Only the owner or an editor/,
    );
  });

  it("can't be used to invite an owner", async () => {
    await expect(invite(drew, "boss@example.com", "owner")).rejects.toThrow();
  });
});

describe("roles", () => {
  it("only the owner changes roles, and each change is logged with before and after", async () => {
    await expect(
      as(db, kate, (q) => q("select public.change_member_role($1, $2, 'editor')", [project, val])),
    ).rejects.toThrow(/Only the project owner/);

    await as(db, drew, (q) =>
      q("select public.change_member_role($1, $2, 'editor')", [project, val]),
    );
    const last = (await events()).at(-1);
    expect(last).toMatchObject({
      summary: "Val is now Editor",
      before: { role: "viewer" },
      after: { role: "editor" },
    });
    await as(db, drew, (q) =>
      q("select public.change_member_role($1, $2, 'viewer')", [project, val]),
    );
  });

  it("an editor cannot remove the owner, or anyone else", async () => {
    await expect(
      as(db, kate, (q) => q("select public.remove_member($1, $2)", [project, drew])),
    ).rejects.toThrow(/owner can't be removed/);
    await expect(
      as(db, kate, (q) => q("select public.remove_member($1, $2)", [project, val])),
    ).rejects.toThrow(/Only the project owner/);
  });

  it("removing someone cuts their access immediately", async () => {
    expect(await visibleProjects(val)).toBe(1);
    await as(db, drew, (q) => q("select public.remove_member($1, $2)", [project, val]));
    expect(await visibleProjects(val)).toBe(0);
    expect((await events()).at(-1)).toMatchObject({
      summary: "Removed Val",
      before: { role: "viewer" },
    });
  });

  it("members see profiles of people on, or in the history of, their projects", async () => {
    const names = await as(db, kate, async (q) =>
      (await q("select display_name from public.profiles order by display_name")).rows.map(
        (r) => r.display_name,
      ),
    );
    // Val and "someone" left, but they're in the history so their names stay readable.
    // Sorted here because database collations order "someone" and "Val" differently.
    expect(names.sort()).toEqual(["Drew", "Kate", "Val", "someone"]);
  });
});

describe("names", () => {
  it("lets you set your own name, and only your own", async () => {
    await as(db, kate, (q) => q("select public.set_my_name('  Kate Rivera ')"));
    const { rows } = await db.query("select display_name from public.profiles where id = $1", [
      kate,
    ]);
    expect(rows[0].display_name).toBe("Kate Rivera");
    await expect(as(db, kate, (q) => q("select public.set_my_name('   ')"))).rejects.toThrow(
      /1 to 80/,
    );
  });

  it("keeps showing names in history after someone leaves", async () => {
    const names = await as(db, drew, async (q) =>
      (await q("select display_name from public.profiles order by display_name")).rows.map(
        (r) => r.display_name,
      ),
    );
    // Val was removed earlier but joined, so stays visible; the stranger who
    // joined and left also appears in history. Someone never on the project doesn't.
    expect(names).toContain("Val");
    const outsider = await createUser(db, "outsider@example.com", "Outsider");
    const seen = await as(
      db,
      drew,
      async (q) => (await q("select 1 from public.profiles where id = $1", [outsider])).rows.length,
    );
    expect(seen).toBe(0);
  });
});

describe("sign-in handoff", () => {
  const nonceHash = "a".repeat(64);

  it("hands a parked code to the app exactly once", async () => {
    await as(db, null, (q) => q("select public.park_sign_in($1, 'code-123')", [nonceHash]));
    const first = await as(db, null, async (q) =>
      (await q("select public.collect_sign_in($1) as code", [nonceHash])).rows[0].code,
    );
    const second = await as(db, null, async (q) =>
      (await q("select public.collect_sign_in($1) as code", [nonceHash])).rows[0].code,
    );
    expect([first, second]).toEqual(["code-123", null]);
  });

  it("forgets codes after 15 minutes and hides the table from clients", async () => {
    await as(db, null, (q) => q("select public.park_sign_in($1, 'old')", [nonceHash]));
    await db.query("update public.auth_handoffs set created_at = now() - interval '16 minutes'");
    const code = await as(db, null, async (q) =>
      (await q("select public.collect_sign_in($1) as code", [nonceHash])).rows[0].code,
    );
    expect(code).toBeNull();
    await expect(as(db, null, (q) => q("select * from public.auth_handoffs"))).rejects.toThrow(/permission denied/);
  });

  it("rejects malformed keys", async () => {
    await expect(as(db, null, (q) => q("select public.park_sign_in('short', 'x')"))).rejects.toThrow();
  });
});
