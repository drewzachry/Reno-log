import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@/lib/roles";
import { getGoogleUser } from "@/lib/google/session";
import { createClient } from "@/lib/supabase/server";

/**
 * The project the browser last created or opened (via `bootstrapProject` or
 * `openProject`). Not a secret — Drive file ids only grant access through
 * the user's own OAuth token, which never reaches this cookie — so it's
 * fine for a Server Component to read it directly for routing decisions.
 */
export const CURRENT_PROJECT_COOKIE = "g_project";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};
export type ProjectSummary = { id: string; name: string; role: Role };

/**
 * The signed-in user and the project they're currently looking at, plus a
 * Supabase client for the pages that still read their record from Postgres
 * (budget, decisions, chat, documents — everything short of sign-in and
 * project bootstrap is still on Supabase until Phase 2 moves it to the
 * Sheet; see CLAUDE.md).
 *
 * There's no server-side table of "your projects" anymore — Drive is the
 * only record, and `drive.file` means the server can't enumerate it even if
 * it wanted to, so unlike before this always has at most one project: the
 * one remembered in a cookie after sign-in or the Picker. There's also no
 * real collaborator-role system yet (that needs Drive-sharing support,
 * planned for a later phase), so `role` is always "owner" for now.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const google = await getGoogleUser();
  if (!google) {
    return { supabase, user: null, myName: null, projects: [], current: null } as const;
  }
  const user: SessionUser = {
    id: google.sub,
    email: google.email,
    name: google.name,
    picture: google.picture,
  };

  const raw = (await cookies()).get(CURRENT_PROJECT_COOKIE)?.value;
  let current: ProjectSummary | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { sheetId: string; name: string };
      if (parsed.sheetId && parsed.name)
        current = { id: parsed.sheetId, name: parsed.name, role: "owner" };
    } catch {
      current = null;
    }
  }
  const projects: ProjectSummary[] = current ? [current] : [];
  return { supabase, user, myName: user.name, projects, current } as const;
});
