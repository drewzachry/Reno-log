import { createHash, randomBytes } from "node:crypto";

/** A random 32-byte invite token for the link. Only its hash is stored. */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Tokens are 43 base64url characters; anything else is rejected before hitting the database. */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
