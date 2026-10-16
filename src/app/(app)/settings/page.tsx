import { ui } from "@/components/ui";
import { chosenName } from "@/lib/names";
import { getSession } from "@/lib/projects";
import { can, ROLE_HINT, ROLE_LABEL, type Role } from "@/lib/roles";
import { InviteForm } from "./InviteForm";
import { NameForm } from "./NameForm";
import { PeopleList, type PendingInvite, type Person } from "./PeopleList";

export const metadata = { title: "Project settings" };

type MemberRow = {
  user_id: string;
  role: Role;
  profile: { display_name: string | null; email: string } | null;
};

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default async function SettingsPage() {
  const { supabase, user, myName, current } = await getSession();
  if (!user || !current) return null;

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("project_members")
      .select("user_id, role, profile:profiles!project_members_user_id_fkey(display_name, email)")
      .eq("project_id", current.id)
      .order("joined_at")
      .returns<MemberRow[]>(),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at")
      .eq("project_id", current.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const people: Person[] = (members ?? []).map((m) => ({
    userId: m.user_id,
    name: m.profile?.display_name ?? m.profile?.email ?? "Someone",
    email: m.profile?.email ?? "",
    role: m.role,
  }));
  const pending: PendingInvite[] = (invites ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as Role,
    expiresOn: dateFmt.format(new Date(i.expires_at)),
  }));

  return (
    <div className="grid max-w-xl gap-8">
      <section>
        <p className={ui.eyebrow}>Project settings</p>
        <h1 className={ui.h1}>{current.name}</h1>
        <p className="text-muted">
          You’re {{ owner: "the", editor: "an", viewer: "a" }[current.role]}{" "}
          {ROLE_LABEL[current.role]}: {ROLE_HINT[current.role].toLowerCase()}.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-lg font-extrabold [font-stretch:105%]">People</h2>
        <PeopleList
          people={people}
          invites={pending}
          meId={user.id}
          canManage={can.managePeople(current.role)}
          canInvite={can.invite(current.role)}
        />
      </section>

      {can.invite(current.role) && (
        <section className="grid gap-3">
          <h2 className="font-display text-lg font-extrabold [font-stretch:105%]">
            Invite someone
          </h2>
          <InviteForm projectName={current.name} />
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="font-display text-lg font-extrabold [font-stretch:105%]">You</h2>
        <NameForm name={chosenName(myName, user.email)} />
      </section>
    </div>
  );
}
