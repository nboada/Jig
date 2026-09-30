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
