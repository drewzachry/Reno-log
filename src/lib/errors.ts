/**
 * Database functions raise plain-English messages with these SQLSTATE codes;
 * those are safe to show as-is. Anything else gets a generic message so
 * internal details never reach the screen.
 */
const USER_FACING_CODES = new Set(["42501", "22023", "23505", "P0002", "28000"]);

/**
 * A function or table the app expects isn't in the database yet: the latest
 * file in supabase/migrations hasn't been run. PGRST202 is PostgREST's
 * "function not found"; 42883 and 42P01 are Postgres's undefined function
 * and undefined table.
 */
const MISSING_MIGRATION_CODES = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

export const GENERIC_ERROR = "Something went wrong. Please try again.";
/** The newest file in supabase/migrations; a test keeps this in step. */
export const LATEST_MIGRATION = "20261024000000_unpaid_invoices.sql";
export const NEEDS_DATABASE_UPDATE = `This part of the app needs a database update. In Supabase's SQL Editor, run supabase/migrations/${LATEST_MIGRATION} (and any earlier ones you haven't run yet), then try again.`;

export function userMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (error?.code && USER_FACING_CODES.has(error.code) && error.message) return error.message;
  if (error?.code && MISSING_MIGRATION_CODES.has(error.code)) return NEEDS_DATABASE_UPDATE;
  return GENERIC_ERROR;
}
