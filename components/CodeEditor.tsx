"use client";

import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { liquid } from "@codemirror/lang-liquid";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { sass } from "@codemirror/lang-sass";
import { sql } from "@codemirror/lang-sql";
import { vue } from "@codemirror/lang-vue";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { EditorView } from "@codemirror/view";
import { githubDark } from "@uiw/codemirror-theme-github";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { useMemo } from "react";

/** CodeMirror grammars per language id. Astro and Svelte files are HTML with extras, close enough to colour. */
const GRAMMARS: Record<string, () => Extension> = {
  javascript: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  typescript: () => javascript({ typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  php: () => php(),
  css: () => css(),
  scss: () => sass(),
  html: () => html(),
  astro: () => html(),
  svelte: () => html(),
  vue: () => vue(),
  liquid: () => liquid(),
  json: () => json(),
  yaml: () => yaml(),
  sql: () => sql(),
  bash: () => StreamLanguage.define(shell),
  markdown: () => markdown(),
};

// Sit on the panel like the rest of the form: no editor background, the app's mono font and size.
// Highest precedence so these win over the colour theme's own background and gutter.
const frame = Prec.highest(EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "transparent", borderRight: "none", color: "var(--color-muted)" },
  // Stretch the typing area over the whole box, so a click anywhere in it starts typing.
  ".cm-content, .cm-gutter": { minHeight: "18rem" },
  ".cm-content": { padding: "12px 0" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--color-raised) 70%, transparent)" },
}));

/** A code editor that colours the code by language, keeps Tab for indenting, and grows with its content. */
export function CodeEditor({
  value,
  onChange,
  language,
  label,
  placeholder,
  onReady,
}: {
  value: string;
  onChange: (value: string) => void;
  language: string;
  label: string;
  placeholder?: string;
  /** Hands over the editor, for changes that should go in as edits (and undo like them). */
  onReady?: (view: EditorView) => void;
}) {
  const extensions = useMemo(
    () => [
      frame,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
      ...(GRAMMARS[language] ? [GRAMMARS[language]()] : []),
    ],
    [language, label],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={githubDark}
      placeholder={placeholder}
      onCreateEditor={onReady}
      // Snippets are mostly pasted, so completion popups would only get in the way.
      basicSetup={{ foldGutter: false, autocompletion: false }}
    />
  );
}
