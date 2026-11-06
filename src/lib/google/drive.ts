"use client";

/**
 * Thin wrappers around the Drive, Sheets and Docs REST APIs, called directly
 * from the browser with the user's own `drive.file`-scoped access token. The
 * server never sees these requests or the token. `drive.file` means the app
 * can only see files it created or that the user explicitly opened with it
 * (via the Picker) — it cannot browse the rest of someone's Drive.
 */

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export type DriveFile = { id: string; name: string };

async function driveFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google API error (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function createFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  return driveFetch<DriveFile>(`${DRIVE_FILES}?fields=id,name`, token, {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
}

export async function createSpreadsheet(
  token: string,
  name: string,
  parentId: string,
): Promise<DriveFile> {
  return driveFetch<DriveFile>(`${DRIVE_FILES}?fields=id,name`, token, {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [parentId],
    }),
  });
}

export async function createDoc(token: string, name: string, parentId: string): Promise<DriveFile> {
  return driveFetch<DriveFile>(`${DRIVE_FILES}?fields=id,name`, token, {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.document",
      parents: [parentId],
    }),
  });
}

/** The folder's `appProperties` is where we remember this project's companion file ids. */
export async function setFolderAppProperties(
  token: string,
  folderId: string,
  appProperties: Record<string, string>,
): Promise<void> {
  await driveFetch(`${DRIVE_FILES}/${folderId}?fields=id`, token, {
    method: "PATCH",
    body: JSON.stringify({ appProperties }),
  });
}

export async function getFolderAppProperties(
  token: string,
  folderId: string,
): Promise<{ name: string; appProperties: Record<string, string> }> {
  const data = await driveFetch<{ name: string; appProperties?: Record<string, string> }>(
    `${DRIVE_FILES}/${folderId}?fields=name,appProperties`,
    token,
  );
  return { name: data.name, appProperties: data.appProperties ?? {} };
}

/** Runs a batch of Sheets API requests (adding tabs, headers, formulas) in one call. */
export async function batchUpdateSpreadsheet(
  token: string,
  spreadsheetId: string,
  requests: unknown[],
): Promise<void> {
  await driveFetch(`${SHEETS}/${spreadsheetId}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export async function updateValues(
  token: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
): Promise<void> {
  await driveFetch(
    `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    token,
    { method: "PUT", body: JSON.stringify({ values }) },
  );
}

/** Writes several ranges (e.g. header rows across many tabs) in one request. */
export async function batchUpdateValues(
  token: string,
  spreadsheetId: string,
  data: { range: string; values: unknown[][] }[],
): Promise<void> {
  await driveFetch(`${SHEETS}/${spreadsheetId}/values:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}
