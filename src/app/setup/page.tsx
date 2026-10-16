import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";

export const metadata = { title: "Setup needed" };

/** Shown instead of a server error when the Supabase settings are missing. */
export default function SetupPage() {
  return (
    <PlainShell>
      <h1 className={ui.h1}>Almost ready</h1>
      <p className="text-muted mt-2">
        Reno Logbook isn’t connected to its database yet. In Vercel, add{" "}
        <code className="font-mono text-sm">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono text-sm">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> under Settings →
        Environment Variables, then redeploy.
      </p>
    </PlainShell>
  );
}
