/**
 * Adds SNIPPETA_ENCRYPTION_KEY to the text of a .env file. Fills an existing
 * empty `SNIPPETA_ENCRYPTION_KEY=` line, otherwise appends one. Returns null
 * when the file already sets a key, so an existing key is never overwritten.
 */
export function withEncryptionKey(current: string, key: string): string | null {
  if (/^SNIPPETA_ENCRYPTION_KEY=[ \t]*\S/m.test(current)) return null;
  const line = `SNIPPETA_ENCRYPTION_KEY=${key}`;
  if (/^SNIPPETA_ENCRYPTION_KEY=[ \t]*$/m.test(current)) {
    return current.replace(/^SNIPPETA_ENCRYPTION_KEY=[ \t]*$/m, line);
  }
  const separator = current === "" ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  return `${current}${separator}# Encrypts saved credentials. Keep a copy somewhere safe: if it is lost, saved secrets cannot be recovered.\n${line}\n`;
}
