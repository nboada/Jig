import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// The note palette: body text a step softer than headings, lime links, faint bullets and rules.
const palette =
  "prose-invert [--tw-prose-invert-body:#d9dbe0] [--tw-prose-invert-headings:var(--color-text)] [--tw-prose-invert-bold:var(--color-text)] [--tw-prose-invert-links:var(--color-accent)] [--tw-prose-invert-code:var(--color-text)] [--tw-prose-invert-bullets:var(--color-faint)] [--tw-prose-invert-counters:var(--color-muted)] [--tw-prose-invert-hr:var(--color-line)] [--tw-prose-invert-quotes:var(--color-text-2)] [--tw-prose-invert-quote-borders:var(--color-line-strong)] [--tw-prose-invert-th-borders:var(--color-line)] [--tw-prose-invert-td-borders:var(--color-line)]";
const shape =
  "max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-raised prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-xl prose-pre:border prose-pre:border-line prose-pre:bg-well prose-blockquote:font-normal prose-blockquote:not-italic prose-hr:my-[1.5em] [overflow-wrap:anywhere]";

/** Typography for small markdown, like a snippet's agent instructions. */
export const proseClass = `prose prose-sm ${palette} ${shape}`;

/** Typography for reading a note, shared by the rendered note and the editor so both look the same. */
// 14px everywhere, with line-height 0.85lh; paragraphs and list items inherit it.
export const readProseClass = `prose prose-sm text-[14px] leading-[0.85lh] ${palette} ${shape} prose-p:leading-[inherit] prose-li:leading-[inherit] prose-h1:text-xl prose-h2:text-lg prose-h3:text-base sm:prose-h1:text-2xl sm:prose-h2:text-xl sm:prose-h3:text-lg`;

/**
 * Renders markdown as formatted text. GitHub-flavoured (tables, task lists, autolinks); raw HTML
 * in the source is shown as text, never rendered. `size="read"` for a note's body.
 */
export function Markdown({ children, size = "sm" }: { children: string; size?: "sm" | "read" }) {
  return (
    <div className={size === "read" ? readProseClass : proseClass}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
