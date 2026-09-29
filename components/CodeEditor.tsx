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
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { useMemo } from "react";
import { SYNTAX } from "@/lib/code-theme";

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

// "Jig Night", the same colours as the read view (lib/code-theme.ts).
const jigNight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: SYNTAX.comment, fontStyle: "italic" },
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier, t.self], color: SYNTAX.keyword },
    { tag: [t.string, t.special(t.string), t.regexp, t.character], color: SYNTAX.string },
    { tag: [t.number, t.bool, t.null, t.atom, t.constant(t.name), t.unit], color: SYNTAX.number },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: SYNTAX.func },
    { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: SYNTAX.type },
    { tag: [t.tagName, t.angleBracket], color: SYNTAX.tag },
    { tag: [t.attributeName, t.propertyName, t.definition(t.propertyName)], color: SYNTAX.attribute },
    { tag: [t.punctuation, t.bracket, t.separator, t.operator, t.derefOperator], color: SYNTAX.punctuation },
    { tag: t.heading, color: SYNTAX.func, fontWeight: "600" },
    { tag: t.link, color: SYNTAX.func },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strong, fontWeight: "600" },
    { tag: t.invalid, color: "#ff7a70" },
  ]),
);

// Sit in the code well like the read view: no editor background, the app's mono font and size.
// Highest precedence so these win over the basic setup's own background and gutter.
const frame = Prec.highest(EditorView.theme({
  "&": { backgroundColor: "transparent", color: SYNTAX.text, fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "transparent", borderRight: "none", color: "#4a4f58" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: SYNTAX.cursor, borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, #cefd53 22%, transparent) !important",
  },
  ".cm-matchingBracket": { backgroundColor: "var(--color-line)", outline: "none" },
  // Stretch the typing area over the whole box, so a click anywhere in it starts typing.
  ".cm-content, .cm-gutter": { minHeight: "18rem" },
  ".cm-content": { padding: "12px 0" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--color-raised) 70%, transparent)" },
}, { dark: true }));

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
      jigNight,
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
      theme="none"
      placeholder={placeholder}
      onCreateEditor={onReady}
      // Snippets are mostly pasted, so completion popups would only get in the way.
      basicSetup={{ foldGutter: false, autocompletion: false }}
    />
  );
}
