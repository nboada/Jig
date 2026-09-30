"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error("[jig] app failed", error), [error]);
  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-[17px] font-medium">Jig couldn't load</p>
          <p className="mt-2 text-body text-text-2">
            {error.digest ? `Something failed on the server (${error.digest}). ` : ""}Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-5 h-9 rounded-lg bg-accent px-4 text-body font-semibold text-accent-ink transition hover:brightness-110"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
