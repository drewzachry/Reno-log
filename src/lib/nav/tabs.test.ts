import { describe, expect, it } from "vitest";
import { activeTab, TABS } from "./tabs";

describe("activeTab", () => {
  it("matches Chat only on the root path", () => {
    expect(activeTab("/")?.label).toBe("Chat");
    expect(activeTab("/decisions")?.label).toBe("Decisions");
  });

  it("matches nested paths by prefix", () => {
    expect(activeTab("/decisions/abc")?.label).toBe("Decisions");
    expect(activeTab("/budget/ledger")?.label).toBe("Budget");
  });

  it("does not match lookalike prefixes", () => {
    expect(activeTab("/budgetary")).toBeUndefined();
  });

  it("has a short label for every tab so seven fit across a phone", () => {
    expect(TABS).toHaveLength(7);
    for (const t of TABS) expect(t.short.length).toBeLessThanOrEqual(6);
  });
});
