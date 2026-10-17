// @vitest-environment node
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERIC_ERROR, LATEST_MIGRATION, NEEDS_DATABASE_UPDATE, userMessage } from "./errors";

describe("userMessage", () => {
  it("passes through the database's plain-English messages", () => {
    expect(
      userMessage({ code: "42501", message: "Only the project owner can change roles." }),
    ).toBe("Only the project owner can change roles.");
  });

  it("says when the database is missing an update", () => {
    for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) {
      expect(
        userMessage({ code, message: "Could not find the function public.save_funding_source" }),
      ).toBe(NEEDS_DATABASE_UPDATE);
    }
  });

  it("names the newest migration file", () => {
    const files = readdirSync(join(__dirname, "../../supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(LATEST_MIGRATION).toBe(files.at(-1));
    expect(NEEDS_DATABASE_UPDATE).toContain(LATEST_MIGRATION);
  });

  it("hides anything else", () => {
    expect(userMessage({ code: "XX000", message: "internal error at line 12" })).toBe(
      GENERIC_ERROR,
    );
    expect(userMessage(null)).toBe(GENERIC_ERROR);
  });
});
