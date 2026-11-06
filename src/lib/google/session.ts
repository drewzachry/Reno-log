import "server-only";
import { cookies } from "next/headers";
import { verifyGoogleIdToken, type GoogleUser } from "./verify";

/**
 * Holds the raw Google ID token, httpOnly so client JS never reads it. The
 * server re-verifies it on every request rather than storing anything about
 * the user; when the token expires (Google ID tokens last about an hour) the
 * client silently re-authenticates and refreshes this cookie. See
 * src/app/api/auth/session/route.ts.
 */
export const ID_TOKEN_COOKIE = "g_id_token";

/** The signed-in user from the verified session cookie, or null. */
export async function getGoogleUser(): Promise<GoogleUser | null> {
  const token = (await cookies()).get(ID_TOKEN_COOKIE)?.value;
  return verifyGoogleIdToken(token);
}
