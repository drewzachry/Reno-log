import { NextResponse } from "next/server";
import { z } from "zod";
import { ID_TOKEN_COOKIE } from "@/lib/google/session";
import { verifyGoogleIdToken } from "@/lib/google/verify";

const bodySchema = z.object({ idToken: z.string().min(1) });

// Google ID tokens are valid for about an hour; re-verified on every request,
// never persisted anywhere but this cookie, so a cautiously short ceiling is
// fine — the client re-authenticates silently well before this expires.
const COOKIE_MAX_AGE = 55 * 60;

/** Called once the browser has a Google ID token, to start (or refresh) the session cookie. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Missing sign-in token." }, { status: 400 });
  }
  const user = await verifyGoogleIdToken(parsed.data.idToken);
  if (!user) {
    return NextResponse.json({ ok: false, error: "That sign-in didn't verify." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ID_TOKEN_COOKIE, parsed.data.idToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
