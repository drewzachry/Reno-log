import { after, NextResponse } from "next/server";
import { runJobs } from "@/lib/documents/jobs";

// Reading a long document takes several minutes; each run works for up to
// two and a half, then starts the next.
export const maxDuration = 300;

/**
 * Runs queued background jobs. Anyone may start a run: it only works through
 * jobs people already queued, and each job is locked while being worked on.
 * Called after an upload, by the Documents tab while something is reading,
 * and once a day by Vercel Cron as a safety net.
 */
async function handle(request: Request) {
  const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  after(() => runJobs(origin));
  return NextResponse.json({ started: true }, { status: 202 });
}

export const POST = handle;
export const GET = handle;
