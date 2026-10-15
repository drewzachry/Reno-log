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

  it("files secondary screens under More", () => {
    expect(activeTab("/photos")?.label).toBe("More");
    expect(activeTab("/history")?.label).toBe("More");
  });

  it("does not match lookalike prefixes", () => {
    expect(activeTab("/budgetary")).toBeUndefined();
  });

  it("keeps the tab bar to five items for one-handed use", () => {
    expect(TABS).toHaveLength(5);
  });
});
