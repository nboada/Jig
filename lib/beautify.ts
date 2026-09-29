import type { Plugin } from "prettier";

/**
 * Formats a file's code the way its language expects. Everything loads on first use, so the
 * formatters (a few hundred KB) never weigh on a page until someone presses Format.
 */

type Formatter = (code: string) => Promise<string>;

// Plugin modules export their pieces as named exports; some bundles also wrap them in `default`.
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

/** The formatted code; throws when the code does not parse, with the parser's message. */
export async function beautify(code: string, language: string): Promise<string> {
  const formatter = FORMATTERS[language];
  if (!formatter) throw new Error(`No formatter for ${language}`);
  return formatter(code);
}
