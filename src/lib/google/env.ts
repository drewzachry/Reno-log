/** Public Google OAuth client id. Safe in the browser: it names the app, not a secret. */
export function googleClientId(): string {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error(
      "Google sign-in isn't configured: set NEXT_PUBLIC_GOOGLE_CLIENT_ID. See SETUP.md.",
    );
  }
  return id;
}

/** Whether Google sign-in has enough configuration to show the sign-in page. */
export function googleConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
}

/** Developer key for the Google Picker API (separate from the OAuth client id). */
export function googlePickerApiKey(): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
  if (!key) {
    throw new Error(
      "The Google Picker isn't configured: set NEXT_PUBLIC_GOOGLE_PICKER_API_KEY. See SETUP.md.",
    );
  }
  return key;
}
