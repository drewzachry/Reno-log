import { redirect } from "next/navigation";
import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";
import { GoogleApiScripts } from "@/components/google/GoogleApiScripts";
import { SignInButton } from "@/components/google/SignInButton";
import { safeNext } from "@/lib/auth/safe-next";
import { googleClientId } from "@/lib/google/env";
import { getGoogleUser } from "@/lib/google/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getGoogleUser()) redirect(next);

  return (
    <PlainShell>
      <GoogleApiScripts />
      <h1 className={ui.h1}>Sign in</h1>
      <p className="text-muted mt-1 mb-5">
        Keep your renovation record in one place, with whoever you share it with. Everything is
        stored in your own Google Drive.
      </p>
      {error && (
        <p role="alert" className={`${ui.error} mb-4`}>
          That sign-in didn’t work. Please try again.
        </p>
      )}
      <SignInButton clientId={googleClientId()} next={next} />
    </PlainShell>
  );
}
