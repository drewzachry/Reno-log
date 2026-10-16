import { NextResponse, type NextRequest } from "next/server";
import { HANDOFF_COOKIE, hashHandoffNonce, isHandoffNonce, unpackSignIn } from "@/lib/auth/handoff";
import { createClient } from "@/lib/supabase/server";

/**
 * Polled by the "check your email" screen. Collects a sign-in parked by the
 * email link and finishes it here, where the PKCE verifier is.
 */
export async function POST(request: NextRequest) {
  const nonce = request.cookies.get(HANDOFF_COOKIE)?.value;
  if (!nonce || !isHandoffNonce(nonce)) return NextResponse.json({ status: "none" });

  const supabase = await createClient();
  const { data } = await supabase.rpc("collect_sign_in", { p_nonce_hash: hashHandoffNonce(nonce) });
  const parked = unpackSignIn(data as string | null);
  if (!parked) return NextResponse.json({ status: "waiting" });

  const { error } = await supabase.auth.exchangeCodeForSession(
    parked.code,
    parked.flowId ? { flowId: parked.flowId } : undefined,
  );
  const res = NextResponse.json({ status: error ? "failed" : "signed-in" });
  res.cookies.delete(HANDOFF_COOKIE);
  if (error) console.error("handoff exchange failed", error.code);
  return res;
}
