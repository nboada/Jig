import { describe, expect, test } from "bun:test";
import { beautify, canBeautify } from "./beautify";

describe("beautify", () => {
  const cases: [string, string, string][] = [
    ["javascript", "const a={b:1,c:[1,2]}", "const a = { b: 1, c: [1, 2] };\n"],
    ["tsx", "export const A=({n}:{n:number})=><b>{n}</b>", "export const A = ({ n }: { n: number }) => <b>{n}</b>;\n"],
    ["css", "a{color:red;margin:0}", "a {\n  color: red;\n  margin: 0;\n}\n"],
    ["scss", ".a{.b{color:red}}", ".a {\n  .b {\n    color: red;\n  }\n}\n"],
    ["json", '{"a":1,"b":[true]}', '{ "a": 1, "b": [true] }\n'],
    ["php", "<?php function a($b){return $b+1;}", "<?php function a($b)\n{\n    return $b + 1;\n}\n"],
    ["liquid", "{%if x%}<p>{{x}}</p>{%endif%}", "{% if x %}\n  <p>{{ x }}</p>\n{% endif %}\n"],
    ["sql", "select a,b from t where a=1", "select\n  a,\n  b\nfrom\n  t\nwhere\n  a = 1"],
  ];

  for (const [language, input, output] of cases) {
    test(language, async () => {
      expect(await beautify(input, language)).toBe(output);
    });
  }

  test("html, vue, yaml and markdown load their plugins", async () => {
    expect(await beautify("<div><p>hi</p></div>", "html")).toContain("<p>hi</p>");
    expect(await beautify("<template><p>{{a}}</p></template>", "vue")).toContain("{{ a }}");
    expect(await beautify("a:   1", "yaml")).toBe("a: 1\n");
    expect(await beautify("#  Title", "markdown")).toBe("# Title\n");
  });

  test("code that does not parse throws", async () => {
    await expect(beautify("const = ;", "javascript")).rejects.toThrow();
  });

  test("languages without a formatter say so", async () => {
    expect(canBeautify("bash")).toBe(false);
    expect(canBeautify("text")).toBe(false);
    await expect(beautify("ls", "bash")).rejects.toThrow("No formatter for bash");
  });
});
