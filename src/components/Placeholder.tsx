export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h1 className="font-display mt-1 mb-1 text-[22px] font-extrabold text-balance [font-stretch:112%]">
        {title}
      </h1>
      <p className="text-muted">{body}</p>
    </section>
  );
}
