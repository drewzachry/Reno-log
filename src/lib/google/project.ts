"use client";

import {
  createDoc,
  createFolder,
  createSpreadsheet,
  getFolderAppProperties,
  setFolderAppProperties,
} from "./drive";
import { initializeProjectSpreadsheet } from "./sheets-schema";

export type DriveProject = {
  folderId: string;
  sheetId: string;
  docId: string;
  uploadsId: string;
  name: string;
};

const FOLDER_SUFFIX = " — Reno";

/**
 * Creates everything a new project needs in the user's Drive: the project
 * folder, the Budget & Record spreadsheet (with its tabs initialized), the
 * Command Center doc, and an Uploads subfolder for originals. The folder's
 * `appProperties` records the other three ids, which is how `openProject`
 * finds them again from just the folder.
 */
export async function bootstrapProject(token: string, name: string): Promise<DriveProject> {
  const folder = await createFolder(token, `${name}${FOLDER_SUFFIX}`);
  const [sheet, doc, uploads] = await Promise.all([
    createSpreadsheet(token, `${name} Budget & Record`, folder.id),
    createDoc(token, `${name} Command Center`, folder.id),
    createFolder(token, "Uploads", folder.id),
  ]);
  await Promise.all([
    setFolderAppProperties(token, folder.id, {
      sheetId: sheet.id,
      docId: doc.id,
      uploadsId: uploads.id,
    }),
    initializeProjectSpreadsheet(token, sheet.id),
  ]);
  return { folderId: folder.id, sheetId: sheet.id, docId: doc.id, uploadsId: uploads.id, name };
}

/** Resolves a project folder (picked via the Picker) into its companion file ids. */
export async function openProject(token: string, folderId: string): Promise<DriveProject> {
  const { name, appProperties } = await getFolderAppProperties(token, folderId);
  const { sheetId, docId, uploadsId } = appProperties;
  if (!sheetId || !docId || !uploadsId) {
    throw new Error("That folder doesn't look like a Reno Logbook project.");
  }
  return {
    folderId,
    sheetId,
    docId,
    uploadsId,
    name: name.endsWith(FOLDER_SUFFIX) ? name.slice(0, -FOLDER_SUFFIX.length) : name,
  };
}
