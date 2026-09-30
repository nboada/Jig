"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncPreferences } from "@/app/actions";
import { PREFS_SYNCED_COOKIE } from "@/lib/prefs";

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
