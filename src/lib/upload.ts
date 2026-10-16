import { createClient } from "@/lib/supabase/client";

export type Uploaded = { path: string; name: string; mime: string; size: number };

/**
 * Uploads an original file straight from the browser to the project's private
 * storage folder. The server registers it afterwards; Storage's own rules
 * check the person may upload to this project.
 */
export async function uploadToProject(
  projectId: string,
  folder: "chat" | "docs",
  file: File,
): Promise<Uploaded> {
  const safe = file.name.replace(/[^\w.-]+/g, "-").slice(-80) || "file";
  const path = `projects/${projectId}/${folder}/${crypto.randomUUID()}-${safe}`;
  const mime = file.type || "application/octet-stream";
  const { error } = await createClient()
    .storage.from("project-files")
    .upload(path, file, { contentType: mime });
  if (error) {
    const big = /size|too large|413/i.test(error.message);
    throw new Error(
      big
        ? `“${file.name}” is too big to upload. Split it into smaller files and try again.`
        : `“${file.name}” didn't upload. Check your connection and try again.`,
    );
  }
  return { path, name: file.name, mime, size: file.size };
}

/** What the document reader accepts. */
export const DOCUMENT_ACCEPT =
  "application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.zip,application/zip,.txt,.csv,text/plain,text/csv,image/*";
