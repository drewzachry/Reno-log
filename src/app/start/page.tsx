import Link from "next/link";
import { redirect } from "next/navigation";
import { PlainShell } from "@/components/PlainShell";
import { ui } from "@/components/ui";
import { chosenName } from "@/lib/names";
import { getSession } from "@/lib/projects";
import { StartForm } from "./StartForm";

export const metadata = { title: "Start a project" };

export default async function StartPage() {
  const { user, myName, projects } = await getSession();
  if (!user) redirect("/login");
  const first = projects.length === 0;

  return (
    <PlainShell>
      <h1 className={ui.h1}>{first ? "Start your first project" : "Start a new project"}</h1>
      <p className="text-muted mt-1 mb-5">
        Just a name for now. You can add your contract, plans and budget next, and invite the people
        you’re renovating with.
      </p>
      <StartForm askName={first} name={chosenName(myName, user.email)} />
      {!first && (
        <Link href="/" className={`${ui.ghost} mt-3 w-full`}>
          Back to {projects[0].name}
        </Link>
      )}
      <form action="/auth/signout" method="post" className="mt-8 text-center">
        <button className="text-muted text-sm underline">Sign out</button>
      </form>
    </PlainShell>
  );
}
