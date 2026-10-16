"use client";

import { useEffect } from "react";

/**
 * Tells the server the viewer's time zone so "today", "3d late" and "in 10d"
 * are counted from the person's own calendar, not the server's.
 */
export function TimeZoneCookie() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && !document.cookie.split("; ").includes(`tz=${encodeURIComponent(tz)}`)) {
        document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      }
    } catch {
      // The server falls back to UTC.
    }
  }, []);
  return null;
}
