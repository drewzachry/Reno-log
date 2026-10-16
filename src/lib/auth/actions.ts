"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "./safe-next";

export type LoginState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; error?: string };

const emailSchema = z.email().transform((e) => e.trim().toLowerCase());

export async function sendCode(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(form.get("email") ?? "").trim());
  if (!parsed.success) {
    return {
      step: "email",
      error: "That doesn't look like an email address.",
      email: String(form.get("email") ?? ""),
    };
  }
  const next = safeNext(String(form.get("next") ?? ""));
  let error: { status?: number; code?: string; message: string } | null;
  try {
    const supabase = await createClient();
    ({ error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    }));
  } catch (e) {
    console.error("sendCode failed", e);
    error = { message: "unreachable" };
  }
  if (error) {
    // Logged without the email address; shows up in the Vercel function logs.
    console.error("signInWithOtp error", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    const tooMany = error.status === 429 || /rate limit/i.test(error.message);
    return {
      step: "email",
      email: parsed.data,
      error: tooMany
        ? "Too many sign-in emails just now. Wait a few minutes and try again."
        : "We couldn't send the email. Check the address and try again.",
    };
  }
  return { step: "code", email: parsed.data };
}

export async function verifyCode(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) {
    return { step: "code", email, error: "Enter the code from the email. It's all numbers." };
  }
  let error: { status?: number; code?: string; message: string } | null;
  try {
    const supabase = await createClient();
    ({ error } = await supabase.auth.verifyOtp({ email, token, type: "email" }));
  } catch (e) {
    console.error("verifyCode failed", e);
    error = { message: "unreachable" };
  }
  if (error) {
    console.error("verifyOtp error", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return {
      step: "code",
      email,
      error: "That code didn't work. It may have expired; send a new one.",
    };
  }
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function signInWithGoogle(form: FormData) {
  const next = safeNext(String(form.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}
