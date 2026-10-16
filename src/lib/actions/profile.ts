"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(1, "Add your name.").max(80, "That name is too long.");

/** Saves the signed-in person's name if the form has one. Returns an error message or undefined. */
export async function saveNameFrom(form: FormData): Promise<string | undefined> {
  if (!form.has("yourName")) return undefined;
  const name = nameSchema.safeParse(form.get("yourName"));
  if (!name.success) return name.error.issues[0].message;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_name", { p_name: name.data });
  return error ? userMessage(error) : undefined;
}

export type NameState = { error?: string; saved?: boolean };

export async function updateMyName(_: NameState, form: FormData): Promise<NameState> {
  const error = await saveNameFrom(form);
  revalidatePath("/", "layout");
  return error ? { error } : { saved: true };
}
