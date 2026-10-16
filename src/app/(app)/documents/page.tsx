import Link from "next/link";
import { EmptyState, PageHeader, Pill } from "@/components/page";
import { getSession } from "@/lib/projects";
import { can } from "@/lib/roles";
import { AddDocuments } from "./AddDocuments";
import { DocumentStatus } from "./DocumentStatus";
import { KIND_LABEL, type DocRow } from "./kinds";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const { supabase, current } = await getSession();
  if (!current) return null;
  const { data } = await supabase
    .from("documents")
    .select("id, title, kind, summary, page_count, status, progress, error, updated_at")
    .eq("project_id", current.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<DocRow[]>();
  const docs = data ?? [];
  const editor = can.edit(current.role);

  return (
    <section>
      <PageHeader
        title="Documents"
        lede="Your contract, plans and specs. Each one is read for you: a short summary and the key points with page numbers. The chat answers from them."
      />
      {editor && <AddDocuments projectId={current.id} />}
      <DocumentStatus
        reading={docs.filter((d) => d.status === "reading").map((d) => d.updated_at)}
      />
      {docs.length === 0 ? (
        <EmptyState>
          {editor
            ? "No documents yet. Add your contract and plans: PDFs, Word files, photos of pages, or a ZIP from your architect."
            : "No documents yet."}
        </EmptyState>
      ) : (
        <ul className="mt-3 grid gap-2.5">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/documents/${d.id}`}
                className="border-line bg-paper block rounded border p-3"
              >
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{d.title}</p>
                  {d.status === "reading" ? (
                    <Pill tone="accent">Reading</Pill>
                  ) : d.status === "failed" ? (
                    <Pill tone="bad">Couldn’t read</Pill>
                  ) : (
                    <Pill>{KIND_LABEL[d.kind] ?? "Other"}</Pill>
                  )}
                </div>
                {d.status === "reading" && (
                  <p className="text-muted mt-1 animate-pulse text-[13.5px]">
                    {d.progress ?? "Reading…"}
                  </p>
                )}
                {d.status === "failed" && <p className="text-bad mt-1 text-[13.5px]">{d.error}</p>}
                {d.status === "ready" && d.summary && (
                  <p className="text-muted mt-1 line-clamp-3 text-[14px]">{d.summary}</p>
                )}
                {d.status === "ready" && d.page_count != null && (
                  <p className="text-muted mt-1 text-[12.5px]">
                    {d.page_count} page{d.page_count === 1 ? "" : "s"}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
