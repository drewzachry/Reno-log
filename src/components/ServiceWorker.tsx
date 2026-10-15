"use client";

import { useEffect } from "react";

/** Registers the app-shell service worker in production builds. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline caching is a nice-to-have; the app works without it.
    });
  }, []);
  return null;
}
