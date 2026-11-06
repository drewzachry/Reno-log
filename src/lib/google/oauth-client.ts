"use client";

/**
 * Wraps Google's OAuth2 token client to get a short-lived access token
 * scoped to `drive.file` only. This token lives in memory in the browser
 * tab — never sent to or stored by our server — and is used to call the
 * Drive, Sheets and Docs REST APIs directly from the client, per the "no
 * database, the user's Drive is the storage" design.
 */
export const DRIVE_SCOPE = "openid email profile https://www.googleapis.com/auth/drive.file";

let cached: { token: string; expiresAt: number } | null = null;
let waitForScript: Promise<void> | null = null;

function whenGoogleReady(): Promise<void> {
  if (waitForScript) return waitForScript;
  waitForScript = new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - start > 10_000)
        return reject(new Error("Google's sign-in script didn't load."));
      setTimeout(check, 100);
    };
    check();
  });
  return waitForScript;
}

/**
 * Returns a valid access token, requesting a new one (which may prompt for
 * consent on first use) only when the cached one is missing or about to
 * expire. Must be called from a user gesture the first time — Google's
 * popup is blocked otherwise.
 */
export async function getDriveAccessToken(clientId: string): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  await whenGoogleReady();
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || "Couldn't get permission for Drive."));
          return;
        }
        cached = {
          token: response.access_token,
          expiresAt: Date.now() + response.expires_in * 1000,
        };
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(`Google sign-in error: ${error.type}`)),
    });
    client.requestAccessToken({ prompt: cached ? "" : "consent" });
  });
}
