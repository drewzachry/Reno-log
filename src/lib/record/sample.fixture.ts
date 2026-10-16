// The sample project from supabase/migrations/*_record.sql, mirrored for unit
// tests. If you change one, change the other (and docs/SAMPLE_PROJECT.md).
import { addDays } from "./dates";
import type { Bucket, Decision, FundingSource, LedgerEntry, Milestone, Status } from "./types";

export function sampleProject(today: string) {
  const milestones: Milestone[] = [
    ["rough_in", "Rough-in", 24],
    ["drywall", "Walls close", 52],
    ["cabinets", "Cabinets in", 80],
    ["countertops", "Countertops templated", 101],
    ["finish", "Finish work", 122],
    ["move_in", "Move-in", 165],
  ].map(([key, label, days], i) => ({
    id: `m-${key}`,
    key: key as string,
    label: label as string,
    explanation: null,
    date: addDays(today, days as number),
    sort_order: i + 1,
  }));

  const buckets: Bucket[] = [
    ["contract", "Construction contract", "contract", 28500000],
    ["tile", "Tile allowance", "allowance", 800000],
    ["plumbing", "Plumbing fixtures allowance", "allowance", 950000],
    ["lighting", "Lighting allowance", "allowance", 400000],
    ["appliances", "Appliances", "owner", 1400000],
    ["cushion", "Cushion", "contingency", 2850000],
  ].map(([id, name, kind, budget], i) => ({
    id: id as string,
    name: name as string,
    kind: kind as Bucket["kind"],
    budget_cents: budget as number,
    sort_order: i + 1,
  }));

  type Row = [string, string, string, number, Status, number | null, string | null];
  const rows: Row[] = [
    ["Primary bath", "Shower valve and trim", "rough_in", 4, "ordered", 124000, "plumbing"],
    ["Primary bath", "Tub (freestanding or alcove)", "rough_in", 6, "exploring", null, "plumbing"],
    [
      "Primary bath",
      "Toilet model and rough-in size",
      "rough_in",
      3,
      "not_started",
      null,
      "plumbing",
    ],
    ["Primary bath", "Vanity size and sink type", "rough_in", 6, "ordered", 285000, "plumbing"],
    ["Primary bath", "Heated bathroom floor (yes/no)", "rough_in", 2, "not_started", null, null],
    ["Hall bath", "Shower valve and trim", "rough_in", 4, "not_started", null, "plumbing"],
    ["Hall bath", "Toilet model and rough-in size", "rough_in", 3, "not_started", null, "plumbing"],
    ["Hall bath", "Vanity size and sink type", "rough_in", 6, "ordered", 118000, "plumbing"],
    ["Kitchen", "Kitchen sink and faucet", "rough_in", 4, "decided", 162000, "plumbing"],
    ["Kitchen", "Range hood type and CFM", "rough_in", 4, "not_started", null, null],
    ["Whole house", "Outlet, switch and USB locations", "rough_in", 1, "not_started", null, null],
    ["Whole house", "Recessed and ceiling light layout", "rough_in", 2, "not_started", null, null],
    ["Whole house", "Register and return locations", "rough_in", 1, "not_started", null, null],
    [
      "Whole house",
      "Blocking for TVs, grab bars, heavy mirrors",
      "drywall",
      1,
      "not_started",
      null,
      null,
    ],
    ["Primary bath", "Shower niche size and location", "drywall", 1, "decided", null, null],
    [
      "Hall bath",
      "Bath accessories (towel bars, hooks, TP)",
      "drywall",
      2,
      "not_started",
      null,
      null,
    ],
    ["Whole house", "Insulation type", "drywall", 2, "decided", null, "contract"],
    ["Kitchen", "Kitchen cabinet layout and style", "cabinets", 10, "ordered", null, "contract"],
    ["Kitchen", "Cabinet paint or stain color", "cabinets", 10, "decided", null, "contract"],
    ["Kitchen", "Appliance package (models)", "cabinets", 10, "decided", 1360000, "appliances"],
    ["Primary bath", "Bathroom vanity order", "cabinets", 8, "not_started", null, "plumbing"],
    ["Kitchen", "Countertop material and slab", "countertops", 3, "exploring", null, "contract"],
    ["Kitchen", "Edge profile", "countertops", 1, "not_started", null, null],
    ["Primary bath", "Bathroom floor tile", "finish", 6, "decided", 390000, "tile"],
    ["Hall bath", "Shower wall tile", "finish", 6, "decided", 535000, "tile"],
    ["Primary bath", "Shower wall tile", "finish", 6, "exploring", null, "tile"],
    ["Kitchen", "Kitchen backsplash", "finish", 4, "not_started", null, "tile"],
    ["Whole house", "Main floor material", "finish", 6, "decided", null, "contract"],
    ["Whole house", "Door hardware finish and style", "finish", 4, "not_started", null, null],
    [
      "Whole house",
      "Decorative fixtures (pendants, sconces)",
      "finish",
      6,
      "exploring",
      null,
      "lighting",
    ],
    ["Whole house", "Paint colors and sheens", "finish", 2, "not_started", null, null],
    ["Whole house", "Shades and blinds", "move_in", 6, "not_started", null, null],
  ];
  const decisions: Decision[] = rows.map(([room, title, ms, lead, status, cost, bucket], i) => ({
    id: `d${i + 1}`,
    title,
    room,
    category: null,
    why: null,
    milestone_key: ms,
    lead_weeks: lead,
    due_date_override: null,
    status,
    selection: null,
    cost_cents: cost,
    bucket_id: bucket,
    source: null,
  }));

  const ledger: LedgerEntry[] = [
    ["invoice", -60, 2850000, "contract", null],
    ["invoice", -21, 4275000, "contract", null],
    ["change_order", -12, 240000, "cushion", "approved"],
    ["payment", -14, 400000, "appliances", null],
    ["payment", -9, 195000, "tile", null],
    ["change_order", -3, 65000, "cushion", "proposed"],
  ].map(([kind, days, amount, bucket, co], i) => ({
    id: `l${i + 1}`,
    kind: kind as LedgerEntry["kind"],
    date: addDays(today, days as number),
    vendor: "Vendor",
    description: null,
    amount_cents: amount as number,
    bucket_id: bucket as string,
    flags: [],
    change_order_status: co as LedgerEntry["change_order_status"],
  }));

  const sources: FundingSource[] = [
    { id: "f1", name: "Savings", amount_cents: 9000000, sort_order: 1 },
    { id: "f2", name: "Home equity line of credit", amount_cents: 20000000, sort_order: 2 },
  ];

  return { milestones, buckets, decisions, ledger, sources };
}
