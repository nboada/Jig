"use client";

import { useEffect, useState, useTransition } from "react";
import { aiSettings, chooseAiPlatform, removeAiPlatformKey, saveAiPlatform } from "@/app/actions";
import { button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SparkleIcon } from "@/components/NoteAi";
import { toast } from "@/components/Toaster";
import { PLATFORMS, type Platform, type PlatformId } from "@/lib/ai-providers";
import type { AiSettings, PlatformStatus } from "@/lib/ai-settings";

const input =
  "h-9 w-full rounded-lg border border-line bg-well px-3 text-ui text-text outline-none transition placeholder:text-faint hover:border-line-strong focus:border-accent disabled:opacity-50";

function statusLabel(status: PlatformStatus) {
  if (status.source === "app") return `Key saved …${status.hint}`;
  if (status.source === "env") return "Key set in the environment";
  return "No key";
}

export function AiSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [editing, setEditing] = useState<PlatformId | null>(null);

  useEffect(() => {
    if (open) aiSettings().then(setSettings);
  }, [open]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="AI settings"
      description="Pick the AI behind AI check. Keys are saved encrypted and never shown again. Locked notes and credentials are never sent."
    >
      <div className="mt-5 space-y-3">
        {!settings ? (
          <p className="text-ui text-muted">Loading…</p>
        ) : (
          <>
            {!settings.encryptionReady && (
              <p className="rounded-lg border border-line bg-well px-3 py-2 text-ui text-text-2">
                Saving keys here needs JIG_ENCRYPTION_KEY, the same key as Credentials. Keys set as environment variables still work.
              </p>
            )}
            <ul className="divide-y divide-line rounded-lg border border-line">
              {PLATFORMS.map((platform) => (
                <PlatformRow
                  key={platform.id}
                  platform={platform}
                  status={settings.platforms.find((p) => p.id === platform.id)!}
                  active={settings.active === platform.id}
                  canSave={settings.encryptionReady}
                  editing={editing === platform.id}
                  onEdit={(on) => setEditing(on ? platform.id : null)}
                  onChange={setSettings}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

function PlatformRow({
  platform,
  status,
  active,
  canSave,
  editing,
  onEdit,
  onChange,
}: {
  platform: Platform;
  status: PlatformStatus;
  active: boolean;
  canSave: boolean;
  editing: boolean;
  onEdit: (on: boolean) => void;
  onChange: (settings: AiSettings) => void;
}) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(status.model ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function run(action: () => Promise<{ settings?: AiSettings; error?: string }>, done: string) {
    setError("");
    start(async () => {
      const result = await action();
      if (result.error || !result.settings) return setError(result.error ?? "That didn't work. Try again.");
      onChange(result.settings);
      setKey("");
      onEdit(false);
      toast.success(done);
    });
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-ui text-text">
            {platform.label}
            {active && (
              <span className="flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 text-meta text-accent">
                <SparkleIcon className="size-3" />
                In use
              </span>
            )}
          </p>
          <p className="text-meta text-muted">{statusLabel(status)}</p>
        </div>
        {status.source && !active && (
          <button type="button" disabled={pending} onClick={() => run(() => chooseAiPlatform(platform.id), `Using ${platform.label}`)} className={button({ size: "sm" })}>
            Use
          </button>
        )}
        <button type="button" onClick={() => onEdit(!editing)} className={button({ variant: "ghost", size: "sm" })}>
          {editing ? "Close" : status.source ? "Change" : "Add key"}
        </button>
      </div>

      {editing && (
        <div className="mt-3 space-y-2.5">
          <p className="text-meta text-muted">{platform.note}</p>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label={`${platform.label} API key`}
            placeholder={status.source === "app" ? `Saved …${status.hint}. Paste a new key to replace it` : "Paste the API key"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={!canSave}
            className={`${input} font-mono`}
          />
          <input
            aria-label={`${platform.label} model`}
            placeholder={`Model (default: ${platform.defaultModel})`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={`${input} font-mono`}
          />
          {error && <p className="text-meta text-danger">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <a href={platform.keyUrl} target="_blank" rel="noreferrer" className="text-meta text-accent hover:underline">
              Get a key
            </a>
            <span className="flex-1" />
            {status.source === "app" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeAiPlatformKey(platform.id), `${platform.label} key removed`)}
                className={button({ variant: "ghost", size: "sm", className: "hover:text-danger" })}
              >
                Remove key
              </button>
            )}
            <button
              type="button"
              disabled={pending || (!key.trim() && model.trim() === (status.model ?? ""))}
              onClick={() => run(() => saveAiPlatform(platform.id, { key, model }), key.trim() ? `${platform.label} key saved` : "Model saved")}
              className={button({ variant: "primary", size: "sm", className: "disabled:opacity-50" })}
            >
              {pending ? (key.trim() ? "Testing…" : "Saving…") : "Save"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
