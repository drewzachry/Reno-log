export const KIND_LABEL: Record<string, string> = {
  plans: "Plans",
  contract: "Contract",
  specs: "Specs",
  estimate: "Estimate",
  permit: "Permit",
  schedule: "Schedule",
  inspection: "Inspection",
  other: "Other",
};

export type DocRow = {
  id: string;
  title: string;
  kind: string;
  summary: string | null;
  page_count: number | null;
  status: "reading" | "ready" | "failed";
  progress: string | null;
  error: string | null;
  updated_at: string;
};
