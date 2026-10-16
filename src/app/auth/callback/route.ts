import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  FLOW_ID_PARAM,
  HANDOFF_PARAM,
  hashHandoffNonce,
  isHandoffNonce,
  packSignIn,
} from "@/lib/auth/handoff";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

/** Where sign-in links and Google sign-in land. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));
  const supabase = await createClient();

  const code = params.get("code");
  const flowId = params.get(FLOW_ID_PARAM);
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const nonce = params.get(HANDOFF_PARAM);

  const target = request.nextUrl.clone();
  target.search = "";

  let error: { code?: string } | null = null;
  if (code) {
    // With the flow id, a browser that didn't start this sign-in fails fast
    // without using up the one-time code.
    ({ error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined));
    if (error?.code === "pkce_code_verifier_not_found" && nonce && isHandoffNonce(nonce)) {
      // Opened outside the browser that asked for it (e.g. Safari instead of the
      // home-screen app): park the code for that browser to collect.
      const parked = await supabase.rpc("park_sign_in", {
        p_nonce_hash: hashHandoffNonce(nonce),
        p_code: packSignIn({ code, flowId }),
      });
      if (!parked.error) {
        target.pathname = "/auth/continue";
        return NextResponse.redirect(target);
      }
      console.error("park_sign_in failed", parked.error.code, parked.error.message);
    }
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    error = { code: "missing_code" };
  }

  if (error) {
    console.error("auth callback failed", error.code);
    target.pathname = "/login";
    target.searchParams.set("error", "link");
    if (next !== "/") target.searchParams.set("next", next);
  } else {
    const [path, query] = next.split("?");
    target.pathname = path;
    if (query) target.search = `?${query}`;
  }
  return NextResponse.redirect(target);
}
