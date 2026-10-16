import Link from "next/link";
import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";
import { chosenName } from "@/lib/names";
import { hashInviteToken, isWellFormedToken } from "@/lib/invite-token";
import { ROLE_HINT, ROLE_LABEL, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "./AcceptForm";

export const metadata = { title: "You're invited" };

type Preview = {
  project_name: string;
  inviter_name: string;
  email_hint: string;
  role: Role;
  status: "pending" | "accepted" | "revoked" | "expired";
};

const DEAD: Record<Exclude<Preview["status"], "pending">, string> = {
  accepted: "This invite has already been used.",
  revoked: "This invite was cancelled.",
  expired: "This invite has expired.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  let invite: Preview | undefined;
  if (isWellFormedToken(token)) {
    const { data } = await supabase.rpc("get_invitation", { p_token_hash: hashInviteToken(token) });
    invite = (data as Preview[] | null)?.[0];
  }
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  const { data: me } = user
    ? await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
    : { data: null };

  if (!invite || invite.status !== "pending") {
    const usedByMe = invite?.status === "accepted" && user;
    return (
      <PlainShell>
        <h1 className={ui.h1}>{usedByMe ? "You're already in" : "This link doesn't work"}</h1>
        <p className="text-muted mt-2 mb-5">
          {usedByMe
            ? "This invite has been used. If it was you, your project is waiting."
            : `${invite ? DEAD[invite.status as keyof typeof DEAD] : "This invite link isn't valid."} Ask the person who invited you to send a new one.`}
        </p>
        <Link href="/" className={`${ui.btn} w-full`}>
          Go to Reno Logbook
        </Link>
      </PlainShell>
    );
  }

  return (
    <PlainShell>
      <p className={ui.eyebrow}>You’re invited</p>
      <h1 className={ui.h1}>
        {invite.inviter_name} invited you to {invite.project_name}
      </h1>
      <p className="text-muted mt-2 mb-5">
        You’ll join as <b className="text-ink">{ROLE_LABEL[invite.role]}</b>:{" "}
        {ROLE_HINT[invite.role].toLowerCase()}.
      </p>

      {user ? (
        <>
          <p className="text-muted mb-3 text-sm">
            Signed in as {user.email}. The invite was sent to {invite.email_hint}.
          </p>
          <AcceptForm token={token} name={chosenName(me?.display_name, user.email)} />
          <form action="/auth/signout" method="post" className="mt-4 text-center">
            <button className="text-muted text-sm underline">Use a different email</button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-3">
            Sign in with the email the invite was sent to ({invite.email_hint}). No password needed.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
            className={`${ui.btn} w-full`}
          >
            Sign in to join
          </Link>
        </>
      )}
    </PlainShell>
  );
}
