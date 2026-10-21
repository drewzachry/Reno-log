import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

/** Pages anyone can open without signing in. */
// /api/jobs/ runs background work started by the server itself and by Vercel Cron.
const PUBLIC_PATHS = ["/login", "/auth/", "/invite/", "/api/jobs/"];

/** Refreshes the Supabase session cookie and sends signed-out visitors to /login. */
export async function middleware(request: NextRequest) {
  let env;
  try {
    env = supabaseEnv();
  } catch {
    // Not configured yet: explain instead of failing every page.
    if (request.nextUrl.pathname === "/setup") return NextResponse.next();
    const setup = request.nextUrl.clone();
    setup.pathname = "/setup";
    setup.search = "";
    return NextResponse.rewrite(setup);
  }
  const { url, key } = env;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims checks the sign-in token's signature on this server when the
  // project uses Supabase's asymmetric signing keys, instead of asking
  // Supabase Auth on every request (it falls back to asking when it must).
  let user = null;
  try {
    user = (await supabase.auth.getClaims()).data?.claims?.sub ?? null;
  } catch {
    // Supabase unreachable: treat as signed out rather than crashing every page.
  }

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
  if (!user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|svg|webp)$).*)",
  ],
};
