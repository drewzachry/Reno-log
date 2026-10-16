"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { resumeReading } from "@/lib/actions/documents";

/** How long a reading document can go without news before we nudge it along. */
const STALE_MS = 3 * 60 * 1000;

/**
 * While something is being read, keeps the progress lines fresh, and restarts
 * reading if it has gone quiet (for example after the app was redeployed).
 */
export function DocumentStatus({ reading }: { reading: string[] }) {
  const router = useRouter();
  const count = reading.length;
  const oldest = reading.reduce((a, t) => Math.min(a, Date.parse(t)), Infinity);

  useEffect(() => {
    if (!count) return;
    const tick = setInterval(() => router.refresh(), 5000);
    if (Date.now() - oldest > STALE_MS) void resumeReading();
    return () => clearInterval(tick);
  }, [count, oldest, router]);

  return null;
}
