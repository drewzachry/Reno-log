import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Pill, SectionTitle } from "@/components/page";
import { TOPICS } from "@/lib/documents/schemas";
import { getSession } from "@/lib/projects";
import { shortDate } from "@/lib/record/dates";
import { money } from "@/lib/record/money";
import { can } from "@/lib/roles";
import { DocumentStatus } from "../DocumentStatus";
import { KIND_LABEL, type DocRow } from "../kinds";
import { DocumentActions } from "./DocumentActions";

export const metadata = { title: "Document" };

type Details = {
  contract_price_cents?: number | null;
  allowances?: { name: string; amount_cents: number }[];
  start_date?: string | null;
  completion_date?: string | null;
};

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, title, kind, summary, page_count, status, progress, error, updated_at, details, file:files(storage_path, original_name, mime_type)",
    )
    .eq("id", id)
    .eq("project_id", current.id)
    .is("deleted_at", null)
    .maybeSingle<
      DocRow & {
        details: Details;
        file: { storage_path: string; original_name: string; mime_type: string } | null;
      }
    >();
  if (!doc) notFound();

  const [{ data: facts }, signed] = await Promise.all([
    supabase
      .from("document_facts")
      .select("id, topic, detail, page")
      .eq("document_id", doc.id)
      .order("sort_order"),
    doc.file
      ? supabase.storage.from("project-files").createSignedUrl(doc.file.storage_path, 3600)
      : null,
  ]);
  const original = signed?.data?.signedUrl ?? null;
  const isPdf = doc.file?.mime_type === "application/pdf";
  const pageLink = (p: number | null) =>
    original && isPdf && p ? `${original}#page=${p}` : original;
  const byTopic = TOPICS.map((t) => ({
    topic: t,
    items: (facts ?? []).filter((f) => (TOPICS.includes(f.topic) ? f.topic : "Other") === t),
  })).filter((g) => g.items.length);
  const d = doc.details ?? {};

  return (
    <article>
      <Link href="/documents" className="text-accent text-[14px]">
        ‹ Documents
      </Link>
      <PageHeader eyebrow={KIND_LABEL[doc.kind] ?? "Document"} title={doc.title}>
        <p className="text-muted mt-1 text-[13px]">
          {doc.file?.original_name}
          {doc.page_count ? ` · ${doc.page_count} page${doc.page_count === 1 ? "" : "s"}` : ""}
        </p>
      </PageHeader>
      <DocumentStatus reading={doc.status === "reading" ? [doc.updated_at] : []} />

      {doc.status === "reading" && (
        <p className="border-line bg-paper text-muted animate-pulse rounded border p-3 text-[14px]">
          {doc.progress ?? "Reading…"}
        </p>
      )}
      {doc.status === "failed" && (
        <p role="alert" className="bg-bad-soft rounded p-3 text-[14px]">
          {doc.error}
        </p>
      )}
      {doc.summary && <p className="text-[15px] leading-relaxed">{doc.summary}</p>}

      {(d.contract_price_cents != null ||
        d.start_date ||
        d.completion_date ||
        (d.allowances?.length ?? 0) > 0) && (
        <dl className="border-line bg-paper mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded border p-3 text-[14px]">
          {d.contract_price_cents != null && (
            <>
              <dt className="text-muted">Contract price</dt>
              <dd className="font-semibold tabular-nums">{money(d.contract_price_cents)}</dd>
            </>
          )}
          {d.start_date && (
            <>
              <dt className="text-muted">Start</dt>
              <dd>{shortDate(d.start_date)}</dd>
            </>
          )}
          {d.completion_date && (
            <>
              <dt className="text-muted">Completion</dt>
              <dd>{shortDate(d.completion_date)}</dd>
            </>
          )}
          {d.allowances?.map((a) => (
            <div key={a.name} className="contents">
              <dt className="text-muted">{a.name}</dt>
              <dd className="tabular-nums">{money(a.amount_cents)}</dd>
            </div>
          ))}
        </dl>
      )}

      {byTopic.length > 0 && (
        <section aria-labelledby="says">
          <SectionTitle id="says" count={facts?.length}>
            What it says
          </SectionTitle>
          <div className="grid gap-3">
            {byTopic.map((g) => (
              <div key={g.topic}>
                <h3 className="text-[13px] font-semibold">{g.topic}</h3>
                <ul className="border-line bg-paper divide-line mt-1 divide-y rounded border">
                  {g.items.map((f) => (
                    <li key={f.id} className="flex items-start gap-3 px-3 py-2 text-[14px]">
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{f.detail}</span>
                      {f.page != null &&
                        (pageLink(f.page) ? (
                          <a
                            href={pageLink(f.page)!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent flex-none font-mono text-[12.5px]"
                          >
                            p.{f.page}
                          </a>
                        ) : (
                          <Pill>p.{f.page}</Pill>
                        ))}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5 grid gap-2 md:flex">
        {original && (
          <a
            href={original}
            target="_blank"
            rel="noreferrer"
            className="border-line inline-flex min-h-11 items-center justify-center rounded border px-4 text-[15px]"
          >
            Open the original
          </a>
        )}
        {can.edit(current.role) && (
          <DocumentActions id={doc.id} failed={doc.status === "failed"} title={doc.title} />
        )}
      </div>
    </article>
  );
}
