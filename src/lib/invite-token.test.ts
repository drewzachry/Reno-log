import { describe, expect, it } from "vitest";
import { hashInviteToken, isWellFormedToken, newInviteToken } from "./invite-token";

describe("invite tokens", () => {
  it("are 32 random bytes, URL-safe, and never repeat", () => {
    const a = newInviteToken();
    expect(isWellFormedToken(a)).toBe(true);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(newInviteToken()).not.toBe(a);
  });

  it("hash to SHA-256 hex, matching what the database tests use", () => {
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("rejects malformed tokens", () => {
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(`${"a".repeat(42)}/`)).toBe(false);
  });
});
