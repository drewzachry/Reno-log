"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ui } from "@/components/ui";
import { getDriveAccessToken } from "@/lib/google/oauth-client";
import { pickProjectFolder } from "@/lib/google/picker";
import { bootstrapProject, openProject, type DriveProject } from "@/lib/google/project";

async function remember(project: DriveProject) {
  const res = await fetch("/api/projects/select", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error("That project didn't save.");
}

export function StartForm({ clientId, pickerApiKey }: { clientId: string; pickerApiKey: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"create" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("create");
    setError(null);
    try {
      const token = await getDriveAccessToken(clientId);
      const project = await bootstrapProject(token, name.trim());
      await remember(project);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the project. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function open() {
    setBusy("open");
    setError(null);
    try {
      const token = await getDriveAccessToken(clientId);
      const folder = await pickProjectFolder(token, pickerApiKey);
      if (!folder) return; // picker cancelled
      const project = await openProject(token, folder.id);
      await remember(project);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that project. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <form onSubmit={create} className="grid gap-3">
        <label className={ui.label} htmlFor="name">
          Project name
        </label>
        <input
          id="name"
          className={ui.input}
          placeholder="e.g. Maple Street renovation"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button className={ui.btn} disabled={busy !== null}>
          {busy === "create" ? "Creating…" : "Start the project"}
        </button>
        <p className={ui.note}>
          Creates a folder in your Google Drive with the budget spreadsheet, the Command Center doc,
          and a place for invoices and photos.
        </p>
      </form>

      <div className="border-line border-t pt-5">
        <button
          type="button"
          className={`${ui.ghost} w-full`}
          onClick={open}
          disabled={busy !== null}
        >
          {busy === "open" ? "Opening…" : "Open an existing project"}
        </button>
        <p className={`${ui.note} mt-2`}>
          For a project someone already set up and shared with you — pick its folder from your
          Drive.
        </p>
      </div>

      {error && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}
    </div>
  );
}
