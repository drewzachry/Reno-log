import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiError } from "@/lib/ai/structured";
import { buildSetup, type SetupJob } from "@/lib/setup/builder";
import { createAdminClient } from "@/lib/supabase/admin";
import { readDocument, ReadError, type ReadJob } from "./reader";

/** How long one run works before handing over to a fresh one (Vercel stops functions at 300s). */
const WORK_MS = 150_000;
const MAX_ATTEMPTS = 4;

type Job = { id: string; type: "read_document" | "build_setup"; attempts: number } & (
  ReadJob | SetupJob
);

/** Starts a job run in its own function call, so the caller doesn't wait for it. */
export async function kickJobs(origin: string) {
  try {
    await fetch(`${origin}/api/jobs/run`, { method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    console.error("jobs: kick failed", e instanceof Error ? e.message : "");
  }
}

function failMessage(e: unknown, what: string) {
  if (e instanceof ReadError || e instanceof AiError) return e.message;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return `The AI key isn't working, so ${what}. Check ANTHROPIC_API_KEY in Vercel, then try again.`;
  return `Something went wrong, so ${what}. Please try again.`;
}

/** Records where a job's work shows up for people: the document or the setup plan. */
async function report(
  admin: SupabaseClient,
  job: Job,
  outcome: { failed: string } | { retrying: true },
) {
  const now = new Date().toISOString();
  const doc = job.type === "read_document" ? (job as ReadJob).payload.document_id : null;
  const plan = job.type === "build_setup" ? (job as SetupJob).payload.plan_id : null;
  if ("failed" in outcome) {
    if (doc)
      await admin
        .from("documents")
        .update({ status: "failed", progress: null, error: outcome.failed, updated_at: now })
        .eq("id", doc);
    if (plan)
      await admin
        .from("setup_plans")
        .update({ status: "failed", progress: null, error: outcome.failed, updated_at: now })
        .eq("id", plan)
        .eq("status", "building");
  } else {
    const p = "Having trouble; trying again in a minute";
    if (doc) await admin.from("documents").update({ progress: p, updated_at: now }).eq("id", doc);
    if (plan)
      await admin.from("setup_plans").update({ progress: p, updated_at: now }).eq("id", plan);
  }
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
    const { data, error } = await admin.rpc("claim_job");
    if (error) {
      console.error("jobs: claim failed", error.code, error.message);
      return;
    }
    const job = data as Job | null;
    if (!job?.id) break;
    const now = () => new Date().toISOString();
    try {
      const r =
        job.type === "build_setup"
          ? (await buildSetup(admin, job as SetupJob), "done" as const)
          : await readDocument(admin, job as ReadJob, deadline);
      if (r === "done") {
        await admin
          .from("jobs")
          .update({ status: "done", locked_until: null, updated_at: now() })
          .eq("id", job.id);
      } else {
        await admin
          .from("jobs")
          .update({ status: "queued", locked_until: null, run_after: now(), updated_at: now() })
          .eq("id", job.id);
        more = true;
        break;
      }
    } catch (e) {
      const permanent =
        e instanceof ReadError ||
        e instanceof AiError ||
        e instanceof Anthropic.AuthenticationError ||
        e instanceof Anthropic.PermissionDeniedError ||
        job.attempts >= MAX_ATTEMPTS;
      console.error(
        "jobs: failed",
        job.type,
        job.id,
        job.attempts,
        e instanceof Error ? e.message : "",
      );
      if (permanent) {
        await admin
          .from("jobs")
          .update({
            status: "failed",
            locked_until: null,
            error: e instanceof Error ? e.message.slice(0, 500) : "failed",
            updated_at: now(),
          })
          .eq("id", job.id);
        await report(admin, job, {
          failed: failMessage(
            e,
            job.type === "build_setup" ? "the plan couldn't be built" : "this couldn't be read",
          ),
        });
      } else {
        // Try again in a minute, from where it stopped.
        await admin
          .from("jobs")
          .update({
            status: "queued",
            locked_until: null,
            run_after: new Date(Date.now() + 60_000).toISOString(),
            updated_at: now(),
          })
          .eq("id", job.id);
        await report(admin, job, { retrying: true });
      }
    }
  }
  if (more) await kickJobs(origin);
}
