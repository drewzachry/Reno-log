export const STATUSES = [
  ["not_started", "Not started"],
  ["exploring", "Exploring"],
  ["decided", "Decided"],
  ["ordered", "Ordered"],
  ["delivered", "Delivered"],
  ["installed", "Installed"],
] as const;

export type Status = (typeof STATUSES)[number][0];
export const STATUS_LABEL = Object.fromEntries(STATUSES) as Record<Status, string>;
/** Still to be decided. */
export const OPEN = new Set<Status>(["not_started", "exploring"]);
/** A choice has been made (it counts against an allowance). */
export const CHOSEN = new Set<Status>(["decided", "ordered", "delivered", "installed"]);

export type BucketKind = "contract" | "allowance" | "owner" | "contingency";
export const BUCKET_KINDS: BucketKind[] = ["contract", "allowance", "owner", "contingency"];
export const BUCKET_KIND_LABEL: Record<BucketKind, string> = {
  contract: "In the contract",
  allowance: "Allowances",
  owner: "You buy directly",
  contingency: "Cushion",
};

/** ISO date without time, e.g. "2026-11-03". */
export type ISODate = string;

export type Milestone = {
  id: string;
  key: string;
  label: string;
  explanation: string | null;
  date: ISODate | null;
  sort_order: number;
};

export type Decision = {
  id: string;
  title: string;
  room: string;
  category: string | null;
  why: string | null;
  milestone_key: string;
  lead_weeks: number;
  due_date_override: ISODate | null;
  status: Status;
  selection: string | null;
  cost_cents: number | null;
  bucket_id: string | null;
  source: string | null;
};

export type Bucket = {
  id: string;
  name: string;
  kind: BucketKind;
  budget_cents: number;
  sort_order: number;
};

export type LedgerEntry = {
  id: string;
  kind: "invoice" | "payment" | "change_order" | "credit";
  date: ISODate;
  vendor: string;
  description: string | null;
  amount_cents: number;
  bucket_id: string | null;
  flags: string[];
  change_order_status: "proposed" | "approved" | "rejected" | null;
};
