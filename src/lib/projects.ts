import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const PROJECT_COOKIE = "reno_project";

export type ProjectSummary = { id: string; name: string; role: Role };

type MembershipRow = { role: Role; project: { id: string; name: string } | null };

/**
 * The signed-in user, their projects and the one they're looking at. The
 * current project comes from a cookie and falls back to their first project.
 * Cached per request so layouts and pages share one lookup.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { supabase, user: null, myName: null, projects: [], current: null } as const;

  const [{ data }, { data: me }] = await Promise.all([
    supabase
      .from("project_members")
      .select("role, project:projects(id, name)")
      .eq("user_id", user.id)
      .order("joined_at")
      .returns<MembershipRow[]>(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  const projects: ProjectSummary[] = (data ?? [])
    .filter((m) => m.project)
    .map((m) => ({ id: m.project!.id, name: m.project!.name, role: m.role }));

  const wanted = (await cookies()).get(PROJECT_COOKIE)?.value;
  const current = projects.find((p) => p.id === wanted) ?? projects[0] ?? null;
  const myName: string | null = me?.display_name ?? null;
  return { supabase, user, myName, projects, current } as const;
});
