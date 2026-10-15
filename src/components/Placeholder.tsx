export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="px-4 pt-6">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="text-muted mt-2">{body}</p>
    </section>
  );
}
