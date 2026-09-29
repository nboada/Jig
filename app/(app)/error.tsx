"use client";

import Link from "next/link";
import { useEffect } from "react";
import { button } from "@/components/Button";

/**
 * What a page shows when rendering it (or an action it ran) fails, instead of Next's bare error
 * screen. The header and tabs stay, since they belong to the layout above this boundary.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error("[jig] page failed", error), [error]);
  return (
    <div className="py-24 text-center">
      <p className="text-[17px] font-medium">Something went wrong</p>
      <p className="mt-2 text-body text-text-2">
        {error.digest ? `The server couldn't finish this (${error.digest}). ` : ""}Try again, or go back home.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className={button({ variant: "primary" })}>
          Try again
        </button>
        <Link href="/" className={button()}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
