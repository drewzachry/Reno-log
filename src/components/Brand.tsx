export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="font-display min-w-0 text-[17px] leading-tight font-extrabold tracking-[-.01em] [font-stretch:118%] md:text-[19px]">
      Reno Logbook
      {subtitle && (
        <small className="text-muted block truncate font-sans text-[12.5px] font-medium tracking-normal [font-stretch:100%]">
          {subtitle}
        </small>
      )}
    </div>
  );
}
