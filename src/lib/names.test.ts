import { describe, expect, it } from "vitest";
import { chosenName } from "./names";

describe("chosenName", () => {
  it("drops the placeholder made from the email", () => {
    expect(chosenName("drew", "Drew@example.com")).toBe("");
  });
  it("keeps a name the person typed", () => {
    expect(chosenName("Drew Zachry", "drew@example.com")).toBe("Drew Zachry");
  });
  it("handles missing values", () => {
    expect(chosenName(null, "a@b.co")).toBe("");
  });
});
