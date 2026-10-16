import { describe, expect, it } from "vitest";
import {
  hashHandoffNonce,
  isHandoffNonce,
  newHandoffNonce,
  packSignIn,
  unpackSignIn,
} from "./handoff";

describe("sign-in handoff", () => {
  it("round-trips a parked code with its flow id", () => {
    const parked = { code: "abc", flowId: "f1" };
    expect(unpackSignIn(packSignIn(parked))).toEqual(parked);
  });

  it("ignores junk", () => {
    expect(unpackSignIn("not json")).toBeNull();
    expect(unpackSignIn(null)).toBeNull();
    expect(unpackSignIn('{"flowId":"x"}')).toBeNull();
  });

  it("uses unguessable nonces stored only as hashes", () => {
    const n = newHandoffNonce();
    expect(isHandoffNonce(n)).toBe(true);
    expect(hashHandoffNonce(n)).toMatch(/^[0-9a-f]{64}$/);
  });
});
