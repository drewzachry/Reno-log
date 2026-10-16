import "server-only";
import { Resend } from "resend";

/** Sends the invite email if Resend is set up. Returns false when it isn't, or sending fails. */
export async function sendInviteEmail(opts: {
  to: string;
  inviterName: string;
  projectName: string;
  roleLabel: string;
  link: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM ?? "Reno Logbook <onboarding@resend.dev>";
  const subject = `${opts.inviterName} invited you to ${opts.projectName} on Reno Logbook`;
  const text = [
    `${opts.inviterName} invited you to the ${opts.projectName} project on Reno Logbook as ${opts.roleLabel}.`,
    "",
    `Open this link to join: ${opts.link}`,
    "",
    "Sign in with this email address. The link works for 14 days.",
  ].join("\n");
  try {
    const { error } = await new Resend(key).emails.send({ from, to: opts.to, subject, text });
    return !error;
  } catch {
    return false;
  }
}
