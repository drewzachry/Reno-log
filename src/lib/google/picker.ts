"use client";

/**
 * Opens Google's Picker so someone can reopen a project created earlier (by
 * them, or by whoever shared it with them) — the project's "<name> — Reno"
 * folder, not the Sheet or Doc directly, since the folder's `appProperties`
 * is where the companion file ids live. Resolves with the chosen folder, or
 * null if the picker was cancelled.
 */
export async function pickProjectFolder(
  accessToken: string,
  developerKey: string,
): Promise<{ id: string; name: string } | null> {
  await whenPickerReady();
  // whenPickerReady resolved via gapi.load("picker", ...), which only calls
  // back once window.google.picker exists.
  const pickerApi = window.google!.picker!;
  return new Promise((resolve, reject) => {
    const view = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);
    const picker = new pickerApi.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(developerKey)
      .setCallback((data) => {
        const action = data[pickerApi.Response.ACTION];
        if (action === pickerApi.Action.PICKED) {
          const docs = data[pickerApi.Response.DOCUMENTS] as Record<string, string>[];
          const doc = docs[0];
          resolve({ id: doc[pickerApi.Document.ID], name: doc[pickerApi.Document.NAME] });
        } else if (action === pickerApi.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    try {
      picker.setVisible(true);
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Couldn't open the picker."));
    }
  });
}

let waitForPicker: Promise<void> | null = null;

function whenPickerReady(): Promise<void> {
  if (waitForPicker) return waitForPicker;
  waitForPicker = new Promise((resolve, reject) => {
    const start = Date.now();
    const loadPicker = () => {
      if (!window.gapi) {
        if (Date.now() - start > 10_000)
          return reject(new Error("Google's API loader didn't load."));
        setTimeout(loadPicker, 100);
        return;
      }
      window.gapi.load("picker", () => resolve());
    };
    loadPicker();
  });
  return waitForPicker;
}
