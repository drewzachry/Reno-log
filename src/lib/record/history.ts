import { shortDate } from "./dates";
import { money } from "./money";
import { STATUS_LABEL, type Status } from "./types";
import { ROLE_LABEL, type Role } from "@/lib/roles";

type Json = Record<string, unknown> | null | undefined;

/** One field's value in plain words. */
function show(key: string, v: unknown, bucketName?: (id: string) => string | undefined): string {
  if (v == null || v === "") return "none";
  switch (key) {
    case "status":
      return STATUS_LABEL[v as Status] ?? String(v);
    case "role":
      return ROLE_LABEL[v as Role] ?? String(v);
    case "cost_cents":
      return money(Number(v));
    case "date":
      return shortDate(String(v));
    case "bucket_id":
      return bucketName?.(String(v)) ?? "another budget line";
    default:
      return String(v);
  }
}

const SHOWN = ["status", "selection", "cost_cents", "bucket_id", "date", "role"];

/**
 * "Was: Exploring · Now: Decided" for an event, from its before and after.
 * Only fields people care about; ids and counts are left out.
 */
export function describeChange(
  before: Json,
  after: Json,
  bucketName?: (id: string) => string | undefined,
): { was: string; now: string } | null {
  const keys = SHOWN.filter((k) => (before && k in before) || (after && k in after));
  if (!keys.length || !before || !after) return null;
  const part = (o: Record<string, unknown>) =>
    keys
      .filter((k) => k in o)
      .map((k) => show(k, o[k], bucketName))
      .join(", ");
  const was = part(before);
  const now = part(after);
  return was || now ? { was, now } : null;
}
