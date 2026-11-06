import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured } from "@/lib/google/env";
import { ID_TOKEN_COOKIE } from "@/lib/google/session";
import { verifyGoogleIdToken } from "@/lib/google/verify";

/** Pages anyone can open without signing in. */
// /api/jobs/ runs background work started by the server itself and by Vercel Cron.
const PUBLIC_PATHS = ["/login", "/auth/", "/invite/", "/api/auth/", "/api/jobs/"];

/** Sends signed-out visitors to /login; verifies the Google session cookie on every request. */
export async function middleware(request: NextRequest) {
  if (!googleConfigured()) {
    // Not configured yet: explain instead of failing every page.
    if (request.nextUrl.pathname === "/setup") return NextResponse.next();
    const setup = request.nextUrl.clone();
    setup.pathname = "/setup";
    setup.search = "";
    return NextResponse.rewrite(setup);
  }

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
  // Middleware has its own cookie API (request.cookies), not next/headers'
  // cookies() — that one only works in Server Components and route handlers.
  const user = await verifyGoogleIdToken(request.cookies.get(ID_TOKEN_COOKIE)?.value);
  if (!user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|svg|webp)$).*)",
  ],
};
