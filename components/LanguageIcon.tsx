import {
  siAstro,
  siCss,
  siGnubash,
  siHtml5,
  siJavascript,
  siJson,
  siMarkdown,
  siPhp,
  siReact,
  siSass,
  siShopify,
  siSvelte,
  siTypescript,
  siVuedotjs,
  siYaml,
} from "simple-icons";

type Brand = { path: string; hex: string };

const BRANDS: Record<string, Brand> = {
  javascript: siJavascript,
  typescript: siTypescript,
  jsx: siReact,
  tsx: siReact,
  php: siPhp,
  css: siCss,
  scss: siSass,
  html: siHtml5,
  liquid: siShopify,
  astro: siAstro,
  vue: siVuedotjs,
  svelte: siSvelte,
  json: siJson,
  yaml: siYaml,
  bash: siGnubash,
  markdown: siMarkdown,
};

function fill(hex: string) {
  return hex === "000000" ? "currentColor" : `#${hex}`;
}

export function LanguageIcon({ language, className = "size-4" }: { language: string; className?: string }) {
  const brand = BRANDS[language];
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" fill={fill(brand.hex)} className={`shrink-0 ${className}`} aria-hidden>
        <path d={brand.path} />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-muted ${className}`}
      aria-hidden
    >
      {language === "sql" ? (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </>
      ) : language === "text" ? (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8" />
        </>
      ) : (
        <path d="m12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5" />
      )}
    </svg>
  );
}
