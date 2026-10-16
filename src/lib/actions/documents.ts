"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { titleFromName } from "@/lib/documents/extract";
import { kickJobs } from "@/lib/documents/jobs";
import { userMessage } from "@/lib/errors";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export type DocResult = { ok: true } | { ok: false; error: string };

const uploads = z
  .array(
    z.object({
      path: z.string().min(1).max(500),
      name: z.string().min(1).max(200),
      mime: z.string().max(200),
      size: z.number().int().min(0),
    }),
  )
  .min(1)
  .max(20);

async function startReading() {
  const origin = await siteOrigin();
  after(() => kickJobs(origin));
}

/** Registers uploaded originals and starts reading each one. */
export async function addDocuments(projectId: string, files: unknown): Promise<DocResult> {
  const parsed = uploads.safeParse(files);
  if (!parsed.success) return { ok: false, error: "Those files didn't upload. Please try again." };
  const supabase = await createClient();
  for (const f of parsed.data) {
    const { data: fileId, error } = await supabase.rpc("record_file", {
      p_project_id: projectId,
      p_path: f.path,
      p_name: f.name,
      p_mime: f.mime || "application/octet-stream",
      p_size: f.size,
      p_kind: "document",
    });
    if (error) return { ok: false, error: userMessage(error) };
    const { error: addError } = await supabase.rpc("add_document", {
      p_project_id: projectId,
      p_file_id: fileId,
      p_title: titleFromName(f.name),
    });
    if (addError) return { ok: false, error: userMessage(addError) };
  }
  await startReading();
  revalidatePath("/documents");
  return { ok: true };
}

export async function retryDocument(documentId: string): Promise<DocResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_document", { p_document_id: documentId });
  if (error) return { ok: false, error: userMessage(error) };
  await startReading();
  revalidatePath("/documents");
  return { ok: true };
}

export async function removeDocument(documentId: string): Promise<DocResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_document", { p_document_id: documentId });
  if (error) return { ok: false, error: userMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}

/** Nudges reading along when a document seems stuck (say, after a deploy). */
export async function resumeReading(): Promise<void> {
  await startReading();
}
