import { describe, expect, it } from "vitest";
import { GENERIC_ERROR, userMessage } from "./errors";

describe("userMessage", () => {
  it("passes through the database's plain-English messages", () => {
    expect(
      userMessage({ code: "42501", message: "Only the project owner can change roles." }),
    ).toBe("Only the project owner can change roles.");
  });

  it("hides anything else", () => {
    expect(userMessage({ code: "42P01", message: 'relation "x" does not exist' })).toBe(
      GENERIC_ERROR,
    );
    expect(userMessage(null)).toBe(GENERIC_ERROR);
  });
});
