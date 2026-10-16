"use server";

import { redirect } from "next/navigation";
import { saveNameFrom } from "@/lib/actions/profile";
import { selectProject } from "@/lib/actions/projects";
import { userMessage } from "@/lib/errors";
import { hashInviteToken, isWellFormedToken } from "@/lib/invite-token";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvite(
  _: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const token = String(form.get("token") ?? "");
  if (!isWellFormedToken(token))
    return { error: "This invite link isn't valid. Ask for a new one." };

  const nameError = await saveNameFrom(form);
  if (nameError) return { error: nameError };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token_hash: hashInviteToken(token),
  });
  if (error) return { error: userMessage(error) };
  await selectProject(data as string);
  redirect("/");
}
