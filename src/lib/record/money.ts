/** "$1,250" from cents; whole dollars, with a minus sign for negatives. */
export function money(cents: number | null | undefined): string {
  const c = cents ?? 0;
  const dollars = Math.round(Math.abs(c) / 100);
  return `${c < 0 ? "−" : ""}$${dollars.toLocaleString("en-US")}`;
}

/** Parses "$1,250.50" or "1250.5" into cents; null when it isn't a number. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
