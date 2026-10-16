export type Role = "owner" | "editor" | "viewer";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_HINT: Record<Role, string> = {
  owner: "Everything, including managing people",
  editor: "Can chat, log changes, upload and invite",
  viewer: "Can see everything and ask questions, but not change anything",
};

/** Mirrors the database rules; the database is what actually enforces them. */
export const can = {
  invite: (role: Role | null) => role === "owner" || role === "editor",
  managePeople: (role: Role | null) => role === "owner",
  edit: (role: Role | null) => role === "owner" || role === "editor",
};
