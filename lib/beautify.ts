import type { Plugin } from "prettier";


type Formatter = (code: string) => Promise<string>;

const load = async (module: Promise<unknown>): Promise<Plugin> => {
  const mod = (await module) as { default?: Plugin } & Plugin;
  return mod.default ?? mod;
};

function prettier(parser: string, plugins: () => Promise<unknown>[]): Formatter {
  return async (code) => {
    const [{ format }, ...loaded] = await Promise.all([
      import("prettier/standalone"),
      ...plugins().map(load),
    ]);
    return format(code, { parser, plugins: loaded, printWidth: 100 });
  };
}

const babel = () => [import("prettier/plugins/babel"), import("prettier/plugins/estree")];
const typescript = () => [import("prettier/plugins/typescript"), import("prettier/plugins/estree")];
const postcss = () => [import("prettier/plugins/postcss")];
const html = () => [...babel(), ...postcss(), import("prettier/plugins/html")];

const FORMATTERS: Record<string, Formatter> = {
  javascript: prettier("babel", babel),
  jsx: prettier("babel", babel),
  typescript: prettier("typescript", typescript),
  tsx: prettier("typescript", typescript),
  json: prettier("json", babel),
  css: prettier("css", postcss),
  scss: prettier("scss", postcss),
  html: prettier("html", html),
  vue: prettier("vue", () => [...html(), import("prettier/plugins/typescript")]),
  yaml: prettier("yaml", () => [import("prettier/plugins/yaml")]),
  markdown: prettier("markdown", () => [import("prettier/plugins/markdown")]),
  php: prettier("php", () => [import("@prettier/plugin-php/standalone")]),
  liquid: prettier("liquid-html", () => [import("@shopify/prettier-plugin-liquid/standalone")]),
  sql: async (code) => (await import("sql-formatter")).format(code, { language: "sql" }),
};

export function canBeautify(language: string): boolean {
  return language in FORMATTERS;
}

export async function beautify(code: string, language: string): Promise<string> {
  const formatter = FORMATTERS[language];
  if (!formatter) throw new Error(`No formatter for ${language}`);
  return formatter(code);
}

export type Split = { line: number; head: string; tail: string; tailLanguage: string };

const STRAYS: Record<string, string> = {
  javascript: "css",
  typescript: "css",
  jsx: "css",
  tsx: "css",
  css: "javascript",
  scss: "javascript",
};

export async function findSplit(code: string, language: string): Promise<Split | null> {
  const tailLanguage = STRAYS[language];
  if (!tailLanguage) return null;
  const lines = code.split("\n");
  for (let i = lines.length - 1; i > 0; i--) {
    if (!lines[i].trim() || lines[i - 1].trim()) continue;
    const head = lines.slice(0, i).join("\n").trimEnd();
    const tail = lines.slice(i).join("\n").trim();
    const parses = (text: string, as: string) => beautify(text, as).then(() => true, () => false);
    if ((await parses(tail, tailLanguage)) && (await parses(head, language))) {
      return { line: i + 1, head: `${head}\n`, tail: `${tail}\n`, tailLanguage };
    }
  }
  return null;
}

export async function detectLanguage(code: string, fileLanguage: string, candidates: string[]): Promise<string | null> {
  const tries = [...candidates, ...(code.trimStart().startsWith("<") ? ["html"] : [])];
  for (const language of new Set(tries)) {
    if (language === fileLanguage || !canBeautify(language)) continue;
    if (await beautify(code, language).then(() => true, () => false)) return language;
  }
  return null;
}
