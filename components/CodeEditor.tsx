"use client";

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { useEffect, useMemo, useState } from "react";
import { SYNTAX } from "@/lib/code-theme";

/**
 * CodeMirror grammars per language id, each loaded the first time it's needed, so an edit page
 * only downloads the one it shows. Astro and Svelte files are HTML with extras, close enough to colour.
 */
const GRAMMARS: Record<string, () => Promise<Extension>> = {
  javascript: async () => (await import("@codemirror/lang-javascript")).javascript(),
  jsx: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  typescript: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
  tsx: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true }),
  php: async () => (await import("@codemirror/lang-php")).php(),
  css: async () => (await import("@codemirror/lang-css")).css(),
  scss: async () => (await import("@codemirror/lang-sass")).sass(),
  html: async () => (await import("@codemirror/lang-html")).html(),
  astro: async () => (await import("@codemirror/lang-html")).html(),
  svelte: async () => (await import("@codemirror/lang-html")).html(),
  vue: async () => (await import("@codemirror/lang-vue")).vue(),
  liquid: async () => (await import("@codemirror/lang-liquid")).liquid(),
  json: async () => (await import("@codemirror/lang-json")).json(),
  yaml: async () => (await import("@codemirror/lang-yaml")).yaml(),
  sql: async () => (await import("@codemirror/lang-sql")).sql(),
  bash: async () => {
    const [{ StreamLanguage }, { shell }] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/shell")]);
    return StreamLanguage.define(shell);
  },
  markdown: async () => (await import("@codemirror/lang-markdown")).markdown(),
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
  // The grammar arrives a moment after the editor; until then the code shows uncoloured.
  const [grammar, setGrammar] = useState<{ language: string; extension: Extension } | null>(null);
  useEffect(() => {
    let current = true;
    GRAMMARS[language]?.().then((extension) => current && setGrammar({ language, extension }));
    return () => {
      current = false;
    };
  }, [language]);

  const extensions = useMemo(
    () => [
      frame,
      jigNight,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
      ...(grammar?.language === language ? [grammar.extension] : []),
    ],
    [grammar, language, label],
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
