import { describe, expect, it } from "vitest";
import { describeChange } from "./history";

describe("describeChange", () => {
  it("shows statuses in words", () => {
    expect(describeChange({ status: "exploring" }, { status: "decided" })).toEqual({
      was: "Exploring",
      now: "Decided",
    });
  });

  it("keeps the earlier pick and its cost", () => {
    expect(
      describeChange(
        { selection: "Hex Carrara marble mosaic", cost_cents: 390000 },
        { selection: "Basketweave marble", cost_cents: 420000 },
      ),
    ).toEqual({ was: "Hex Carrara marble mosaic, $3,900", now: "Basketweave marble, $4,200" });
  });

  it("shows dates and an unset value", () => {
    expect(describeChange({ date: null }, { date: "2026-11-24", deadlines_moved: 13 })).toEqual({
      was: "none",
      now: "Nov 24",
    });
  });

  it("names budget lines when it can", () => {
    expect(
      describeChange({ bucket_id: "a" }, { bucket_id: "b" }, (id) =>
        id === "b" ? "Tile allowance" : undefined,
      ),
    ).toEqual({
      was: "another budget line",
      now: "Tile allowance",
    });
  });

  it("returns nothing for events without a before and after", () => {
    expect(describeChange(null, { name: "x" })).toBeNull();
  });
});
