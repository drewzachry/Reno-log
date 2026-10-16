import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

/**
 * Playwright global setup: a throwaway database with every migration applied,
 * PostgREST in front of it, and the test auth gateway on :54321. Needs a
 * Postgres server at TEST_DATABASE_URL (same as `npm run test:db`).
 */
const ROOT = join(__dirname, "../..");
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/postgres";
const POSTGREST_VERSION = "v12.2.3";
const JWT_SECRET = "e2e-only-secret-e2e-only-secret-0123456789";
const DB = "reno_e2e";

async function postgrestBinary() {
  const dir = join(ROOT, "node_modules/.cache/postgrest", POSTGREST_VERSION);
  const bin = join(dir, "postgrest");
  if (existsSync(bin)) return bin;
  mkdirSync(dir, { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download PostgREST (${res.status})`);
  writeFileSync(join(dir, "pgrst.tar.xz"), Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["xf", "pgrst.tar.xz"], { cwd: dir });
  return bin;
}

async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`${url} didn't start`);
}

export default async function globalSetup() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`create database ${DB}`);
  await admin.end();

  const dbUrl = new URL(ADMIN_URL);
  dbUrl.pathname = `/${DB}`;
  const db = new Client({ connectionString: dbUrl.toString() });
  await db.connect();
  await db.query(readFileSync(join(ROOT, "supabase/tests/supabase-stub.sql"), "utf8"));
  const migrations = join(ROOT, "supabase/migrations");
  for (const f of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.query(readFileSync(join(migrations, f), "utf8"));
  }
  await db.query(`do $$ begin create role authenticator login noinherit;
    exception when duplicate_object then null; end $$;
    grant anon, authenticated, service_role to authenticator;`);
  await db.end();

  const authenticatorUrl = new URL(dbUrl);
  authenticatorUrl.username = "authenticator";
  authenticatorUrl.password = "";
  const children: ChildProcess[] = [
    spawn(await postgrestBinary(), [], {
      env: {
        ...process.env,
        PGRST_DB_URI: authenticatorUrl.toString(),
        PGRST_DB_SCHEMAS: "public",
        PGRST_DB_ANON_ROLE: "anon",
        PGRST_JWT_SECRET: JWT_SECRET,
        PGRST_SERVER_PORT: "54322",
      },
      stdio: "inherit",
    }),
    spawn(process.execPath, [join(__dirname, "gateway.mjs")], {
      env: {
        ...process.env,
        DATABASE_URL: dbUrl.toString(),
        JWT_SECRET,
        PORT: "54321",
        POSTGREST_PORT: "54322",
      },
      stdio: "inherit",
    }),
  ];
  await waitFor("http://localhost:54322/");
  await waitFor("http://localhost:54321/auth/v1/settings");

  return async () => {
    children.forEach((c) => c.kill());
  };
}
