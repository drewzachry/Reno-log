import "server-only";
// Deep imports rather than the `jose` barrel: the barrel also pulls in JWE
// encrypt/decrypt, which uses CompressionStream/DecompressionStream — APIs
// the Edge Runtime (this file is used from middleware) doesn't support. We
// never call those, but bundling them in trips Next.js's Edge Runtime
// warning anyway; these two imports only pull in JWT verification.
import { createRemoteJWKSet } from "jose/jwks/remote";
import { jwtVerify } from "jose/jwt/verify";
import { googleClientId } from "./env";

// Overridable so end-to-end tests can point this at a local fake issuer
// (e2e/stack/fake-google.mjs) instead of the real Google endpoint — nothing
// else about verification changes; the token still has to carry a genuine
// signature, issuer, audience and expiry. Unset in every real environment.
const JWKS_URL = process.env.GOOGLE_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs";
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export type GoogleUser = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

/**
 * Verifies a Google ID token's signature, issuer, audience and expiry against
 * Google's published keys. Returns the claims we use, or null if the token is
 * missing, expired or doesn't belong to this app. Never trust an unverified
 * token: this is the only thing standing between a request and someone else's
 * project data.
 */
export async function verifyGoogleIdToken(
  idToken: string | undefined | null,
): Promise<GoogleUser | null> {
  if (!idToken) return null;
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: googleClientId(),
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    // Expired, malformed, wrong audience, or Google's key set unreachable.
    return null;
  }
}
