"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { saveNameFrom } from "@/lib/actions/profile";
import { userMessage } from "@/lib/errors";
import { PROJECT_COOKIE } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

async function rememberProject(id: string) {
  (await cookies()).set(PROJECT_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give your project a name.")
  .max(120, "That name is too long.");

export async function createProject(
  _: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const name = nameSchema.safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const nameError = await saveNameFrom(form);
  if (nameError) return { error: nameError };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_project", { p_name: name.data });
  if (error) return { error: userMessage(error) };
  await rememberProject(data as string);
  redirect("/");
}

export async function switchProject(form: FormData) {
  const id = z.uuid().safeParse(form.get("projectId"));
  if (id.success) await rememberProject(id.data);
  redirect("/");
}

export async function selectProject(id: string) {
  await rememberProject(id);
}
