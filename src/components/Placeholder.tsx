import { EmptyState, PageHeader } from "./page";

export function Placeholder({
  title,
  body,
  empty,
}: {
  title: string;
  body: string;
  empty?: string;
}) {
  return (
    <section>
      <PageHeader title={title} lede={body} />
      {empty && <EmptyState>{empty}</EmptyState>}
    </section>
  );
}
