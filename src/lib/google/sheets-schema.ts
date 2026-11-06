"use client";

import { batchUpdateSpreadsheet, batchUpdateValues } from "./drive";

/**
 * The Budget & Record spreadsheet's shape: one tab per table, row 1 =
 * headers, data from row 2 on. Ledger and History are append-only — nothing
 * here ever writes over row 2+ on those tabs after creation.
 *
 * Ledger's "Bucket" column is one of: Contract, Allowance, Change Order,
 * Owner, Contingency. "Item #" cross-references the specific row on the
 * matching tab (a Change Orders "#" or an Allowances item) when the bucket
 * is Allowance or Change Order, so those tabs' Paid columns can SUMIFS back
 * to it. This convention isn't in the product brief verbatim; Phase 2's
 * Sheet read/write layer is where it should get tests and, if needed,
 * revisited.
 */
const TABS_AFTER_SUMMARY = [
  "Ledger",
  "Accounts",
  "Change Orders",
  "Allowances",
  "Credit Cards",
  "Decisions",
  "Schedule",
  "Punch List",
  "Contacts",
  "Facts",
  "History",
] as const;

const HEADERS: Record<string, string[]> = {
  Ledger: [
    "Date paid",
    "Payee/invoice",
    "Description",
    "Bucket",
    "Item #",
    "Paid from",
    "Amount",
    "Note",
    "Source file link",
    "Logged by",
  ],
  Accounts: ["Account", "Opening balance", "Opening date", "Available"],
  "Change Orders": ["#", "Item", "Committed", "Paid", "Counts in buffer", "Status", "Remaining"],
  Allowances: ["Item", "Budget", "Actual", "Paid"],
  "Credit Cards": ["Date", "Card", "Payee", "Description", "Amount", "Note"],
  Decisions: ["Area", "Item", "Status", "Decide-by date", "Decided on", "Notes"],
  Schedule: ["Phase/milestone", "Status", "Start", "End", "Depends on"],
  "Punch List": ["Area", "Item", "Status", "Owner"],
  Contacts: ["Role", "Name", "Company", "Phone", "Email"],
  Facts: ["Date", "Fact", "Category", "Logged by"],
  History: ["Timestamp", "Who", "What changed", "Before", "After"],
};

/** Row/value layout for the Summary tab: labels in column A, inputs or formulas in column B. */
const SUMMARY_ROWS: { label: string; formula?: string }[] = [
  { label: "GC remaining-cost estimate (enter this)" }, // input, left blank
  { label: "Total available", formula: "=SUM(Accounts!D2:D)" },
  { label: "Change orders committed", formula: "=SUM('Change Orders'!C2:C)" },
  { label: "Allowances budgeted", formula: "=SUM(Allowances!B2:B)" },
  {
    label: "Total remaining (GC estimate + change orders + allowances)",
    formula: "=B2+B3+B4",
  },
  { label: "BUFFER (available − remaining)", formula: "=B2-B6" },
];
// Row index note: label row n sits at sheet row n+1 (row 1 is the "Summary"
// title), so "Total available" is row 3, and SUMMARY_ROWS[4]'s formula
// above referencing B2/B3/B4/B6 lines up with that 1-based offset.

/**
 * Adds the 11 tabs beyond the spreadsheet's default first sheet, renames
 * that first sheet to "Summary", then writes every tab's header row (or, for
 * Summary, its labels and starter formulas) in one follow-up call. Called
 * once, right after the spreadsheet is created.
 */
export async function initializeProjectSpreadsheet(token: string, spreadsheetId: string) {
  await batchUpdateSpreadsheet(token, spreadsheetId, [
    { updateSheetProperties: { properties: { sheetId: 0, title: "Summary" }, fields: "title" } },
    ...TABS_AFTER_SUMMARY.map((title) => ({ addSheet: { properties: { title } } })),
  ]);

  const data: { range: string; values: unknown[][] }[] = [
    { range: "Summary!A1", values: [["Summary"]] },
    {
      range: "Summary!A2",
      values: SUMMARY_ROWS.map((row) => [row.label, row.formula ?? ""]),
    },
    ...TABS_AFTER_SUMMARY.map((title) => ({
      range: `'${title}'!A1`,
      values: [HEADERS[title]],
    })),
  ];
  await batchUpdateValues(token, spreadsheetId, data);
}
