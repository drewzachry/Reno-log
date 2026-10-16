import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
  });

  it("refuses other sites and junk", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
