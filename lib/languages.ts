export const LANGUAGES = [
  { id: "javascript", label: "JavaScript", extensions: ["js", "mjs", "cjs"] },
  { id: "typescript", label: "TypeScript", extensions: ["ts", "mts", "cts"] },
  { id: "jsx", label: "JSX", extensions: ["jsx"] },
  { id: "tsx", label: "TSX", extensions: ["tsx"] },
  { id: "php", label: "PHP", extensions: ["php"] },
  { id: "css", label: "CSS", extensions: ["css"] },
  { id: "scss", label: "SCSS", extensions: ["scss"] },
  { id: "html", label: "HTML", extensions: ["html", "htm"] },
  { id: "liquid", label: "Liquid", extensions: ["liquid"] },
  { id: "astro", label: "Astro", extensions: ["astro"] },
  { id: "vue", label: "Vue", extensions: ["vue"] },
  { id: "svelte", label: "Svelte", extensions: ["svelte"] },
  { id: "json", label: "JSON", extensions: ["json"] },
  { id: "yaml", label: "YAML", extensions: ["yml", "yaml"] },
  { id: "sql", label: "SQL", extensions: ["sql"] },
  { id: "bash", label: "Shell", extensions: ["sh", "bash", "zsh"] },
  { id: "markdown", label: "Markdown", extensions: ["md", "mdx"] },
  { id: "text", label: "Plain text", extensions: ["txt"] },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [LanguageId, ...LanguageId[]];

const FAMILIES: Record<string, readonly LanguageId[]> = {
  javascript: ["javascript", "typescript", "jsx", "tsx"],
  css: ["css", "scss"],
};

export const LANGUAGE_CHOICES = LANGUAGES.filter(
  (l) => !Object.values(FAMILIES).some((members) => members.includes(l.id) && members[0] !== l.id),
);

export function languageFamily(id: string): string {
  for (const [lead, members] of Object.entries(FAMILIES)) {
    if ((members as readonly string[]).includes(id)) return lead;
  }
  return id;
}

export function familyMembers(id: string): string[] {
  return [...(FAMILIES[id] ?? [id])];
}

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function languageForFile(name: string, fallback: string = "text"): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGES.find((l) => (l.extensions as readonly string[]).includes(ext))?.id ?? fallback;
}

export function defaultFileName(language: string): string {
  const ext = LANGUAGES.find((l) => l.id === language)?.extensions[0] ?? "txt";
  return `snippet.${ext}`;
}

export function withExtension(name: string, language: string): string {
  return `${name.replace(/\.[^./]+$/, "")}.${defaultFileName(language).split(".").pop()}`;
}
