import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

/** Plain-English failure the person can act on (shown as is). */
export class AiError extends Error {}

/** The model for long reading and planning work, and how hard it thinks. */
export function heavySettings() {
  const effort = process.env.DOCS_EFFORT;
  return {
    model: process.env.DOCS_MODEL || "claude-opus-5-5",
    effort: (["low", "medium", "high"].includes(effort ?? "") ? effort : "medium") as
      "low" | "medium" | "high",
  };
}

function parseJson<T>(schema: z.ZodType<T>, raw: string): T | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * One structured-output call: Claude answers in JSON that fits the schema,
 * and the answer is checked again with Zod before anyone uses it. Usage is
 * recorded against the project and person.
 */
export async function askStructured<T>(opts: {
  admin: SupabaseClient;
  projectId: string;
  userId: string | null;
  purpose: "document" | "setup";
  system: string;
  schema: object;
  check: z.ZodType<T>;
  content: BetaContentBlockParam[];
  /** Room for long answers (a whole-house plan); thinking counts toward it. */
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<T> {
  const { model, effort } = heavySettings();
  const client = new Anthropic({ timeout: opts.timeoutMs ?? 240_000, maxRetries: 1 });
  const res = await client.beta.messages
    .stream({
      model,
      max_tokens: opts.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort,
        format: { type: "json_schema", schema: opts.schema as Record<string, unknown> },
      },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
    })
    .finalMessage();
  await opts.admin.from("usage").insert({
    project_id: opts.projectId,
    user_id: opts.userId,
    purpose: opts.purpose,
    model: res.model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    cache_read_tokens: res.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: res.usage.cache_creation_input_tokens ?? 0,
  });
  if (res.stop_reason === "refusal")
    throw new AiError("The AI couldn't do this one. Try again, or with different documents.");
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = parseJson(opts.check, text);
  if (!parsed) throw new Error(`unreadable model output (${res.stop_reason})`);
  return parsed;
}
