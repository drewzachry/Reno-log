import { PageHeader, SectionTitle } from "@/components/page";
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
    <div>
      <PageHeader
        eyebrow="Project settings"
        title={current.name}
        lede={`You’re ${{ owner: "the", editor: "an", viewer: "a" }[current.role]} ${ROLE_LABEL[current.role]}: ${ROLE_HINT[current.role].toLowerCase()}.`}
      />

      <section aria-labelledby="people">
        <SectionTitle id="people">People</SectionTitle>
        <PeopleList
          people={people}
          invites={pending}
          meId={user.id}
          canManage={can.managePeople(current.role)}
          canInvite={can.invite(current.role)}
        />
      </section>

      {can.invite(current.role) && (
        <section aria-labelledby="invite">
          <SectionTitle id="invite">Invite someone</SectionTitle>
          <div className="border-line bg-paper rounded border p-3">
            <InviteForm projectName={current.name} />
          </div>
        </section>
      )}

      <section aria-labelledby="you">
        <SectionTitle id="you">You</SectionTitle>
        <div className="border-line bg-paper rounded border p-3">
          <NameForm name={chosenName(myName, user.email)} />
        </div>
      </section>
    </div>
  );
}
