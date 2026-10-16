"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendInviteEmail } from "@/lib/email";
import { userMessage } from "@/lib/errors";
import { hashInviteToken, newInviteToken } from "@/lib/invite-token";
import { siteOrigin } from "@/lib/origin";
import { getSession } from "@/lib/projects";
import { ROLE_LABEL } from "@/lib/roles";

// Every action below calls one database function, which checks the caller's
// role, makes the change and writes the history event in one transaction.

export type InviteState =
  { ok: false; error?: string } | { ok: true; email: string; link: string; emailed: boolean };

const inviteSchema = z.object({
  email: z
    .email("That doesn't look like an email address.")
    .transform((e) => e.trim().toLowerCase()),
  role: z.enum(["editor", "viewer"]),
});

export async function invitePerson(_: InviteState, form: FormData): Promise<InviteState> {
  const parsed = inviteSchema.safeParse({
    email: String(form.get("email") ?? "").trim(),
    role: form.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { supabase, user, current } = await getSession();
  if (!user || !current) return { ok: false, error: "Please sign in first." };

  const token = newInviteToken();
  const { error } = await supabase.rpc("create_invitation", {
    p_project_id: current.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_token_hash: hashInviteToken(token),
  });
  if (error) return { ok: false, error: userMessage(error) };

  const link = `${await siteOrigin()}/invite/${token}`;
  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();
  const emailed = await sendInviteEmail({
    to: parsed.data.email,
    inviterName: me?.display_name ?? me?.email ?? "Someone",
    projectName: current.name,
    roleLabel: ROLE_LABEL[parsed.data.role],
    link,
  });

  revalidatePath("/settings");
  return { ok: true, email: parsed.data.email, link, emailed };
}

export type ActionResult = { error?: string };

async function run(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc(fn, args);
  revalidatePath("/settings");
  revalidatePath("/history");
  return error ? { error: userMessage(error) } : {};
}

export async function cancelInvite(invitationId: string) {
  return run("revoke_invitation", { p_invitation_id: z.uuid().parse(invitationId) });
}

export async function changeRole(userId: string, role: string) {
  const { current } = await getSession();
  if (!current) return { error: "Please sign in first." };
  return run("change_member_role", {
    p_project_id: current.id,
    p_user_id: z.uuid().parse(userId),
    p_role: z.enum(["editor", "viewer"]).parse(role),
  });
}

export async function removePerson(userId: string) {
  const { current } = await getSession();
  if (!current) return { error: "Please sign in first." };
  return run("remove_member", { p_project_id: current.id, p_user_id: z.uuid().parse(userId) });
}
