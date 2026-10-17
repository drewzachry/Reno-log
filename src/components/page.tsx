/** Shared page building blocks, so every screen reads the same way. */

export function PageHeader({
  title,
  lede,
  eyebrow,
  children,
}: {
  title: string;
  lede?: React.ReactNode;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-3">
      {eyebrow && (
        <p className="font-display text-muted text-[11.5px] font-bold tracking-[.09em] uppercase [font-stretch:90%]">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-[22px] leading-tight font-extrabold text-balance [font-stretch:112%]">
        {title}
      </h1>
      {lede && <p className="text-muted mt-1 max-w-[60ch] text-[14.5px]">{lede}</p>}
      {children}
    </header>
  );
}

/** Small uppercase section title, as the prototype's h3.grp, with an optional count. */
export function SectionTitle({
  children,
  count,
  id,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  count?: React.ReactNode;
  id?: string;
  as?: "h2" | "h3";
}) {
  return (
    <Tag
      id={id}
      className="font-display text-muted mt-6 mb-2 flex items-baseline justify-between gap-2 text-[12.5px] font-bold tracking-[.08em] uppercase [font-stretch:95%]"
    >
      <span>{children}</span>
      {count != null && <span className="tabular-nums">{count}</span>}
    </Tag>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-line text-muted rounded border border-dashed px-4 py-5 text-center text-[14px]">
      {children}
    </p>
  );
}

/** A tinted label, e.g. "4 days late" or "Not approved yet". */
export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "bad" | "warn" | "ok" | "accent";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-bg text-muted border border-line",
    bad: "bg-bad-soft text-bad",
    warn: "bg-warn-soft text-warn",
    ok: "bg-ok-soft text-ok",
    accent: "bg-accent-soft text-accent",
  };
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-xl px-2 py-0.5 text-[12px] font-semibold [overflow-wrap:anywhere] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
