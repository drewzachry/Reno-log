/**
 * Database functions raise plain-English messages with these SQLSTATE codes;
 * those are safe to show as-is. Anything else gets a generic message so
 * internal details never reach the screen.
 */
const USER_FACING_CODES = new Set(["42501", "22023", "23505", "P0002", "28000"]);

export const GENERIC_ERROR = "Something went wrong. Please try again.";

export function userMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (error?.code && USER_FACING_CODES.has(error.code) && error.message) return error.message;
  return GENERIC_ERROR;
}
