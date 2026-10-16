"use client";

/** Last-resort error page when even the root layout fails; it can't use the app's styles. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p>Reloading usually fixes this, especially if the app was just updated.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ minHeight: 44, width: "100%", fontSize: 16 }}
        >
          Reload
        </button>
        {error.digest && (
          <p style={{ fontSize: 12, color: "#5b6870" }}>Error code {error.digest}</p>
        )}
      </body>
    </html>
  );
}
