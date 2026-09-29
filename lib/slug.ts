/** Turns a title into a URL- and file-name-safe slug: "Same height divs" → "same-height-divs". */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "snippet";
}

/**
 * Keeps automatically named files in step with the title. A file is automatic when its name
 * (before the extension) is "snippet" or the slug of the previous title; hand-picked names stay.
 * A rename that would collide with another file is skipped.
 */
export function renameForTitle<T extends { name: string }>(files: T[], from: string, to: string): T[] {
  const automatic = new Set(["snippet", slugify(from)]);
  const stem = slugify(to);
  const taken = new Set(files.map((f) => f.name));
  return files.map((file) => {
    const dot = file.name.lastIndexOf(".");
    const [base, ext] = dot > 0 ? [file.name.slice(0, dot), file.name.slice(dot)] : [file.name, ""];
    const name = `${stem}${ext}`;
    if (!automatic.has(base) || name === file.name || taken.has(name)) return file;
    taken.delete(file.name);
    taken.add(name);
    return { ...file, name };
  });
}
