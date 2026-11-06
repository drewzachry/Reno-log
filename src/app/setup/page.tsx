import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";

export const metadata = { title: "Setup needed" };

/** Shown instead of a server error when Google sign-in isn’t configured yet. */
export default function SetupPage() {
  return (
    <PlainShell>
      <h1 className={ui.h1}>Almost ready</h1>
      <p className="text-muted mt-2">
        Reno Logbook isn’t connected to Google sign-in yet. In Vercel, add{" "}
        <code className="font-mono text-sm">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> and{" "}
        <code className="font-mono text-sm">NEXT_PUBLIC_GOOGLE_PICKER_API_KEY</code> under Settings
        → Environment Variables, then redeploy. See{" "}
        <code className="font-mono text-sm">SETUP.md</code> for the Google Cloud steps.
      </p>
    </PlainShell>
  );
}
