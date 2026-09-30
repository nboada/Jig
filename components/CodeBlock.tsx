import { codeToHtml } from "shiki";
import { CodeTabs, type RenderedFile } from "@/components/CodeTabs";
import { jigNight } from "@/lib/code-theme";
import { languageForFile } from "@/lib/languages";

export async function highlight(name: string, content: string, fallback: string): Promise<string> {
  const lang = languageForFile(name, fallback);
  const code = content.replace(/\n+$/, "");
  return codeToHtml(code, { lang: lang === "text" ? "plaintext" : lang, theme: jigNight }).catch(() =>
    codeToHtml(code, { lang: "plaintext", theme: jigNight }),
  );
}

export async function CodeFiles({ files, fallback }: { files: { name: string; content: string }[]; fallback: string }) {
  const rendered: RenderedFile[] = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      content: file.content,
      html: await highlight(file.name, file.content, fallback),
      lines: file.content.replace(/\n+$/, "").split("\n").length,
      bytes: new TextEncoder().encode(file.content).length,
    })),
  );
  return <CodeTabs files={rendered} />;
}

export async function CodeBlock({ name, content, fallback }: { name: string; content: string; fallback: string }) {
  return <CodeFiles files={[{ name, content }]} fallback={fallback} />;
}
