/**
 * "$1,250" from cents, with a minus sign for negatives. Whole dollars when
 * there are no cents; "$1,250.50" when there are, so figures always add up.
 */
export function money(cents: number | null | undefined): string {
  const c = Math.round(cents ?? 0);
  const abs = Math.abs(c);
  const digits = abs % 100 === 0 ? 0 : 2;
  const text = (abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${c < 0 ? "−" : ""}$${text}`;
}

/** Parses "$1,250.50" or "1250.5" into cents; null when it isn't a number. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
