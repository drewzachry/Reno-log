import Link from "next/link";
import { redirect } from "next/navigation";
import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";
import { GoogleApiScripts } from "@/components/google/GoogleApiScripts";
import { googleClientId, googlePickerApiKey } from "@/lib/google/env";
import { getSession } from "@/lib/projects";
import { StartForm } from "./StartForm";

export const metadata = { title: "Start a project" };

export default async function StartPage() {
  const { user, projects } = await getSession();
  if (!user) redirect("/login");
  const first = projects.length === 0;

  return (
    <PlainShell>
      <GoogleApiScripts />
      <h1 className={ui.h1}>{first ? "Start your first project" : "Start a new project"}</h1>
      <p className="text-muted mt-1 mb-5">
        Name it, and we’ll set up a folder in your Google Drive to hold the budget, the record and
        anything you upload. Or open one someone already shared with you.
      </p>
      <StartForm clientId={googleClientId()} pickerApiKey={googlePickerApiKey()} />
      {!first && (
        <Link href="/" className={`${ui.ghost} mt-6 w-full`}>
          Back to {projects[0].name}
        </Link>
      )}
      <form action="/auth/signout" method="post" className="mt-8 text-center">
        <button className="text-muted text-sm underline">Sign out</button>
      </form>
    </PlainShell>
  );
}
