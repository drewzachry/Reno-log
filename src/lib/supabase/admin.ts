import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Supabase with the service role, for the few writes only the server may make:
 * the assistant's replies, its proposal cards, and AI usage. Bypasses RLS, so
 * callers check the person's access first. Never import this in client code.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(supabaseEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
