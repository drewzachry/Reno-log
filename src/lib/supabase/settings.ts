import "server-only";
import { supabaseEnv } from "./env";

/** Whether Google sign-in is switched on in the Supabase project. Hidden if Supabase can't say. */
export async function googleEnabled(): Promise<boolean> {
  try {
    const { url, key } = supabaseEnv();
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
