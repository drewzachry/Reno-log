import { describe, expect, it } from "vitest";
import { can } from "./roles";

describe("role checks", () => {
  it("lets owners and editors invite, never viewers", () => {
    expect(can.invite("owner")).toBe(true);
    expect(can.invite("editor")).toBe(true);
    expect(can.invite("viewer")).toBe(false);
    expect(can.invite(null)).toBe(false);
  });

  it("lets only the owner change roles or remove people", () => {
    expect(can.managePeople("owner")).toBe(true);
    expect(can.managePeople("editor")).toBe(false);
    expect(can.managePeople("viewer")).toBe(false);
  });

  it("lets viewers read but not edit", () => {
    expect(can.edit("viewer")).toBe(false);
    expect(can.edit("editor")).toBe(true);
  });
});
