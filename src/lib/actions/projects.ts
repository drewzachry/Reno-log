"use server";

/**
 * Stub pending a later phase: accepting an invite (`invites.ts`) and loading
 * the sample project (`record.ts`) both still call this with a Supabase
 * project id — a concept the Drive-based project model (see CLAUDE.md)
 * doesn't have. Until those two flows are rebuilt against Drive, this is a
 * no-op so the app keeps building; neither flow actually lands the caller
 * in a working project yet.
 */
export async function selectProject(id: string): Promise<void> {
  void id;
}
