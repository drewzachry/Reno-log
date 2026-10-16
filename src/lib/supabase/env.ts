/** Public Supabase settings. Both are safe in the browser; RLS protects the data. */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase isn't configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  // People paste the REST endpoint by mistake; the client wants the project URL.
  return { url: url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""), key };
}
