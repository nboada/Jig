import { codeToHtml } from "shiki";
import { languageForFile } from "@/lib/languages";
import { CopyButton } from "./CopyButton";

export async function CodeBlock({ name, content, fallback }: { name: string; content: string; fallback: string }) {
  const lang = languageForFile(name, fallback);
  const html = await codeToHtml(content, {
    lang: lang === "text" ? "plaintext" : lang,
    theme: "github-dark-default",
  }).catch(() => codeToHtml(content, { lang: "plaintext", theme: "github-dark-default" }));

  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-panel">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <span className="truncate font-mono text-[13px] text-text">{name}</span>
        <CopyButton value={content} />
      </figcaption>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </figure>
  );
}
