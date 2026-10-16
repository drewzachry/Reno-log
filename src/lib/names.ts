/**
 * A name worth pre-filling: the one the person chose, not the placeholder made
 * from their email address at sign-up.
 */
export function chosenName(name: string | null | undefined, email: string | null | undefined) {
  if (!name) return "";
  const local = email?.split("@")[0]?.toLowerCase();
  return name.toLowerCase() === local ? "" : name;
}
