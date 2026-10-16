import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

/**
 * A throwaway Postgres database with the Supabase stub and every migration
 * applied. Needs a server at TEST_DATABASE_URL (default: local, port 54329)
 * whose user can create databases.
 */
export const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/postgres";

const root = join(__dirname, "../..");

export async function createTestDatabase() {
  const name = `reno_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(readFileSync(join(root, "supabase/tests/supabase-stub.sql"), "utf8"));
  const dir = join(root, "supabase/migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.query(readFileSync(join(dir, file), "utf8"));
  }

  return {
    db,
    async drop() {
      await db.end();
      const a = new Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** Creates a user the way Supabase Auth does; the migration's trigger makes the profile. */
export async function createUser(db: Client, email: string, name?: string): Promise<string> {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, name ? { full_name: name } : {}],
  );
  return rows[0].id;
}

/**
 * Runs fn as a signed-in user (role authenticated, auth.uid() = userId), or as
 * a signed-out visitor when userId is null, inside a transaction that is
 * rolled back unless keep is set.
 */
export async function as<T>(
  db: Client,
  userId: string | null,
  fn: (q: Client["query"]) => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
    ]);
    const result = await fn(db.query.bind(db) as Client["query"]);
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
