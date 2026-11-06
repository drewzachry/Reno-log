"use client";

import Script from "next/script";

/**
 * Loads Google's two client-side libraries once per page:
 * - `gsi/client`: Sign In With Google (`google.accounts.id`) and the OAuth2
 *   token client (`google.accounts.oauth2`) used for Drive access.
 * - `apis.google.com/js/api.js`: the loader `gapi.load` needs for the Picker.
 * Neither call reaches our server; both load the real libraries straight from
 * Google. Safe to render on more than one page — Next dedupes by src.
 */
export function GoogleApiScripts() {
  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />
    </>
  );
}
