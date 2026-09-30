"use client";

import { useState, useTransition } from "react";
import { createEncryptionKey } from "@/app/actions";
import { button } from "./Button";
import { CopyButton } from "./CopyButton";

const primary = button({ variant: "primary" });

export function KeySetup({ local }: { local: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);

  if (local) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className={primary}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await createEncryptionKey();
              setError(result.error ?? "");
            })
          }
        >
          {pending ? "Creating" : "Create encryption key"}
        </button>
        <p className="text-muted">It is saved to .env.local in this project and used straight away.</p>
        {error && <p className="text-danger">{error}</p>}
      </div>
    );
  }

  if (!generated) {
    return (
      <button
        type="button"
        className={primary}
        onClick={() => setGenerated(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))))}
      >
        Generate a key
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-well px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-meta">{`JIG_ENCRYPTION_KEY=${generated}`}</code>
        <CopyButton value={generated} />
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-text-2">
        <li>In Vercel, open the project, then Settings and Environment Variables.</li>
        <li>Add JIG_ENCRYPTION_KEY with this value.</li>
        <li>Redeploy, then reload this page.</li>
      </ol>
    </div>
  );
}
