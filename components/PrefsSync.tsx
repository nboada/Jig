"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncPreferences } from "@/app/actions";
import { PREFS_SYNCED_COOKIE } from "@/lib/prefs";

/**
 * Catches this browser up with layout preferences changed on another device. Pages keep reading
 * cookies, so nothing waits on it: after the page is up, at most every few minutes, it asks the
 * server once and redraws only if something changed.
 */
export function PrefsSync() {
  const router = useRouter();
  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c.startsWith(`${PREFS_SYNCED_COOKIE}=`))) return;
    syncPreferences().then((changed) => {
      if (changed) router.refresh();
    });
  }, [router]);
  return null;
}
