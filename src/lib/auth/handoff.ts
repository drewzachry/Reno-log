import { hashInviteToken, isWellFormedToken, newInviteToken } from "@/lib/invite-token";

/**
 * Sign-in handoff for the iPhone home-screen app, which keeps its own cookies:
 * the app keeps a random nonce in a cookie and puts it in the email link. When
 * the link opens in Safari, Safari can't finish (the PKCE verifier lives in the
 * app), so it parks the one-time code under the nonce's hash and the waiting
 * app collects and exchanges it. See supabase/migrations/*_sign_in_handoff.sql.
 */
export const HANDOFF_COOKIE = "reno_handoff";
export const HANDOFF_PARAM = "h";
export const FLOW_ID_PARAM = "sb_flow_id";

export const newHandoffNonce = newInviteToken;
export const isHandoffNonce = isWellFormedToken;
export const hashHandoffNonce = hashInviteToken;

export type ParkedSignIn = { code: string; flowId: string | null };

export function packSignIn(p: ParkedSignIn): string {
  return JSON.stringify(p);
}

export function unpackSignIn(raw: string | null | undefined): ParkedSignIn | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ParkedSignIn>;
    return typeof p.code === "string" ? { code: p.code, flowId: p.flowId ?? null } : null;
  } catch {
    return null;
  }
}
