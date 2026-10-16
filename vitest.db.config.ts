import { defineConfig } from "vitest/config";

// Database tests: migrations and Row Level Security against a real Postgres.
// Point TEST_DATABASE_URL at a Postgres 15+ server whose user can create
// databases (default postgres://postgres@localhost:54329/postgres).
export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/tests/**/*.test.ts"],
    testTimeout: 20_000,
    // Test files share one Postgres server; run them one at a time.
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
