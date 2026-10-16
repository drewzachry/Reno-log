"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDocuments } from "@/lib/actions/documents";
import { DOCUMENT_ACCEPT, uploadToProject, type Uploaded } from "@/lib/upload";

export function AddDocuments({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, 20);
    if (!files.length) return;
    setError(null);
    try {
      const done: Uploaded[] = [];
      for (const [i, f] of files.entries()) {
        setStatus(
          files.length === 1 ? `Uploading ${f.name}…` : `Uploading ${i + 1} of ${files.length}…`,
        );
        done.push(await uploadToProject(projectId, "docs", f));
      }
      setStatus("Starting to read…");
      const r = await addDocuments(projectId, done);
      if (!r.ok) setError(r.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Those files didn't upload. Please try again.");
    } finally {
      setStatus(null);
    }
  }

  return (
    <div className="grid gap-2">
      <label
        className={`bg-accent text-accent-ink inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded px-4 text-[15px] font-semibold md:w-auto md:justify-self-start ${status ? "opacity-60" : ""}`}
      >
        {status ?? "Add documents"}
        <input
          type="file"
          multiple
          hidden
          accept={DOCUMENT_ACCEPT}
          disabled={status != null}
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-muted text-[13px]">
        PDFs, Word files, photos of pages, or a ZIP from your architect. Reading takes a minute or
        two, longer for big plan sets; you can leave this screen.
      </p>
      {error && (
        <p role="alert" className="bg-bad-soft rounded px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
