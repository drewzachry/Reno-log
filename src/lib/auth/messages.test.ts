import { describe, expect, it } from "vitest";
import { sendErrorMessage } from "./messages";

describe("sendErrorMessage", () => {
  it("passes on the per-address wait", () => {
    expect(
      sendErrorMessage({
        status: 429,
        code: "over_email_send_rate_limit",
        message: "For security purposes, you can only request this after 42 seconds.",
      }),
    ).toBe("Please wait 42 seconds before asking for another email.");
  });

  it("explains the hourly cap", () => {
    expect(
      sendErrorMessage({
        status: 429,
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
      }),
    ).toMatch(/Try again in an hour/);
  });

  it("falls back to a generic message", () => {
    expect(sendErrorMessage({ status: 0, message: "fetch failed" })).toMatch(/couldn.t send/);
  });
});
