import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";

export const metadata = { title: "Back to the app" };

/** Shown in Safari after it hands a sign-in over to the home-screen app. */
export default function ContinuePage() {
  return (
    <PlainShell>
      <h1 className={ui.h1}>You’re signed in</h1>
      <p className="text-muted mt-2">
        Go back to the Reno Logbook app. It will carry on by itself in a few seconds. You can close
        this page.
      </p>
    </PlainShell>
  );
}
