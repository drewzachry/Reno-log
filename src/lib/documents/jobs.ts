import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { readDocument, ReadError, type ReadJob } from "./reader";

/** How long one run works before handing over to a fresh one (Vercel stops functions at 300s). */
const WORK_MS = 150_000;
const MAX_ATTEMPTS = 4;

/** Starts a job run in its own function call, so the caller doesn't wait for it. */
export async function kickJobs(origin: string) {
  try {
    await fetch(`${origin}/api/jobs/run`, { method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    console.error("jobs: kick failed", e instanceof Error ? e.message : "");
  }
}

function failMessage(e: unknown) {
  if (e instanceof ReadError) return e.message;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return "The AI key isn't working, so this couldn't be read. Check ANTHROPIC_API_KEY in Vercel, then tap Try again.";
  return "Something went wrong reading this. Tap Try again.";
}

/**
 * Works through queued jobs until time runs low, then hands over to a new
 * run if there's more to do. Safe to start any number of times: each job is
 * locked while someone is working on it.
 */
export async function runJobs(origin: string) {
  const admin = createAdminClient();
  if (!admin || !process.env.ANTHROPIC_API_KEY) return;
  const deadline = Date.now() + WORK_MS;
  let more = false;

  while (Date.now() < deadline) {
    const { data: job, error } = await admin.rpc("claim_job");
    if (error) {
      console.error("jobs: claim failed", error.code, error.message);
      return;
    }
    if (!job?.id) break;
    const docId = (job as ReadJob).payload.document_id;
    try {
      const r = await readDocument(admin, job as ReadJob, deadline);
      if (r === "done") {
        await admin
          .from("jobs")
          .update({ status: "done", locked_until: null, updated_at: new Date().toISOString() })
          .eq("id", job.id);
      } else {
        await admin
          .from("jobs")
          .update({
            status: "queued",
            locked_until: null,
            run_after: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        more = true;
        break;
      }
    } catch (e) {
      const permanent =
        e instanceof ReadError ||
        e instanceof Anthropic.AuthenticationError ||
        e instanceof Anthropic.PermissionDeniedError ||
        job.attempts >= MAX_ATTEMPTS;
      console.error("jobs: read failed", job.id, job.attempts, e instanceof Error ? e.message : "");
      const now = new Date();
      if (permanent) {
        await admin
          .from("jobs")
          .update({
            status: "failed",
            locked_until: null,
            error: e instanceof Error ? e.message.slice(0, 500) : "failed",
            updated_at: now.toISOString(),
          })
          .eq("id", job.id);
        await admin
          .from("documents")
          .update({
            status: "failed",
            progress: null,
            error: failMessage(e),
            updated_at: now.toISOString(),
          })
          .eq("id", docId);
      } else {
        // Try again in a minute, from where it stopped.
        await admin
          .from("jobs")
          .update({
            status: "queued",
            locked_until: null,
            run_after: new Date(now.getTime() + 60_000).toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", job.id);
        await admin
          .from("documents")
          .update({
            progress: "Having trouble; trying again in a minute",
            updated_at: now.toISOString(),
          })
          .eq("id", docId);
      }
    }
  }
  if (more) await kickJobs(origin);
}
