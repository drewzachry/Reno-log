import { NextResponse, type NextRequest } from "next/server";
import { ID_TOKEN_COOKIE } from "@/lib/google/session";
import { CURRENT_PROJECT_COOKIE } from "@/lib/projects";

export async function POST(request: NextRequest) {
  const target = request.nextUrl.clone();
  target.pathname = "/login";
  target.search = "";
  const res = NextResponse.redirect(target, { status: 303 });
  res.cookies.delete(ID_TOKEN_COOKIE);
  res.cookies.delete(CURRENT_PROJECT_COOKIE);
  return res;
}
