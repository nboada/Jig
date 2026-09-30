import type { ThemeRegistration } from "shiki";

export const SYNTAX = {
  text: "#e8e9ec",
  comment: "#5d626c",
  keyword: "#e9c46a",
  string: "#9fd8a8",
  number: "#f2a57c",
  func: "#8cc8ff",
  type: "#7fd6cf",
  tag: "#ff9e8a",
  attribute: "#e9c46a",
  punctuation: "#8b909a",
  cursor: "#cefd53",
} as const;

export const jigNight: ThemeRegistration = {
  name: "jig-night",
  type: "dark",
  colors: { "editor.background": "#00000000", "editor.foreground": SYNTAX.text },
  tokenColors: [
    { settings: { foreground: SYNTAX.text } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: SYNTAX.comment, fontStyle: "italic" } },
    {
      scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression", "variable.language"],
      settings: { foreground: SYNTAX.keyword },
    },
    { scope: ["string", "string.quoted", "string.template", "markup.inline.raw", "string.regexp"], settings: { foreground: SYNTAX.string } },
    { scope: ["constant.numeric", "constant.language", "constant.character", "support.constant", "variable.other.constant"], settings: { foreground: SYNTAX.number } },
    { scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function", "variable.function"], settings: { foreground: SYNTAX.func } },
    {
      scope: ["entity.name.type", "entity.name.class", "support.class", "support.type", "entity.other.inherited-class", "storage.type.primitive"],
      settings: { foreground: SYNTAX.type },
    },
    { scope: ["entity.name.tag", "punctuation.definition.tag", "meta.tag"], settings: { foreground: SYNTAX.tag } },
    { scope: ["entity.other.attribute-name", "support.type.property-name", "meta.object-literal.key"], settings: { foreground: SYNTAX.attribute } },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: SYNTAX.punctuation } },
    { scope: ["markup.heading", "entity.name.section"], settings: { foreground: SYNTAX.func, fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
    { scope: ["markup.underline.link", "markup.link"], settings: { foreground: SYNTAX.func } },
    { scope: ["markup.inserted"], settings: { foreground: "#8fe3a5" } },
    { scope: ["markup.deleted"], settings: { foreground: "#ffa39b" } },
  ],
};
