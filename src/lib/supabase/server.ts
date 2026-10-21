import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** Supabase client for Server Components, route handlers and server actions, acting as the signed-in user. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  });
}

export type SessionUser = { id: string; email: string | undefined };

/**
 * The signed-in user from their verified sign-in token, or null. The token's
 * signature is checked locally when Supabase uses asymmetric signing keys,
 * which saves a round trip to Supabase Auth on every page.
 */
export async function verifiedUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<SessionUser | null> {
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: typeof c.email === "string" ? c.email : undefined } : null;
}

/** The signed-in user, or null. */
export async function getUser() {
  return verifiedUser(await createClient());
}
