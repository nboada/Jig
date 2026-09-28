/** Shown on credentials pages when SNIPPETA_ENCRYPTION_KEY is missing or invalid. */
export function KeyMissing() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 rounded-lg border border-accent/40 bg-accent/10 p-6 text-sm">
      <p className="text-base font-medium">Credentials need an encryption key</p>
      <p className="text-text/75">
        Set <code className="font-mono">SNIPPETA_ENCRYPTION_KEY</code> on the server to 32 random bytes in base64, then
        restart. Snippets and notes work without it.
      </p>
      <pre className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-xs">openssl rand -base64 32</pre>
      <p className="text-muted">Keep a copy somewhere safe. If the key is lost, saved secrets cannot be recovered.</p>
    </div>
  );
}
