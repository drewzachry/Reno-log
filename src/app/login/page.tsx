import { redirect } from "next/navigation";
import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";
import { signInWithGoogle } from "@/lib/auth/actions";
import { safeNext } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/supabase/server";
import { googleEnabled } from "@/lib/supabase/settings";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getUser().catch(() => null)) redirect(next);
  const google = await googleEnabled();

  return (
    <PlainShell>
      <h1 className={ui.h1}>Sign in</h1>
      <p className="text-muted mt-1 mb-5">
        Keep your renovation record in one place, with whoever you share it with.
      </p>
      {error && (
        <p role="alert" className={`${ui.error} mb-4`}>
          {error === "google"
            ? "Google sign-in didn't work. Try the email code instead."
            : "That sign-in link didn't work. It may have expired, or it opened in a different browser. Ask for a new code below."}
        </p>
      )}
      <LoginForm next={next} />
      {google && (
        <form action={signInWithGoogle} className="border-line mt-6 border-t pt-6">
          <input type="hidden" name="next" value={next} />
          <button className={`${ui.ghost} w-full`}>Continue with Google</button>
        </form>
      )}
    </PlainShell>
  );
}
