import { KeySetup } from "./KeySetup";

/** Shown on credentials pages when JIG_ENCRYPTION_KEY is missing or invalid. */
export function KeyMissing() {
  const local = process.env.NODE_ENV !== "production";
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-line bg-panel p-6 text-body">
      <div className="space-y-2">
        <p className="engraved">Encryption key required</p>
        <p className="text-[17px] font-semibold">Credentials need an encryption key</p>
        <p className="text-text-2">
          Saved passwords and API keys are encrypted with a key that lives in the server&apos;s settings, never in the
          database. Snippets and notes work without it.
        </p>
      </div>
      <KeySetup local={local} />
      <p className="text-muted">
        Keep a copy of the key somewhere safe, like your password manager. If it is lost, saved secrets cannot be
        recovered.
      </p>
    </div>
  );
}
