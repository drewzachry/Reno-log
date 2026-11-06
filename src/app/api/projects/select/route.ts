import { NextResponse } from "next/server";
import { z } from "zod";
import { CURRENT_PROJECT_COOKIE } from "@/lib/projects";

const projectSchema = z.object({
  folderId: z.string().min(1),
  sheetId: z.string().min(1),
  docId: z.string().min(1),
  uploadsId: z.string().min(1),
  name: z.string().min(1).max(120),
});

/**
 * Remembers the project the browser just created or opened via Drive, so
 * Server Components (the app shell, redirects) know which one is current
 * without needing their own database lookup. Called right after
 * `bootstrapProject`/`openProject` succeed.
 */
export async function POST(request: Request) {
  const parsed = projectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "That project didn't save." }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CURRENT_PROJECT_COOKIE, JSON.stringify(parsed.data), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
