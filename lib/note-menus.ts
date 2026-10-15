import { Extension, type Editor, type Range } from "@tiptap/core";
import { BubbleMenuPlugin } from "@tiptap/extension-bubble-menu";
import Suggestion from "@tiptap/suggestion";

type Item = { title: string; hint: string; keywords: string; run: (editor: Editor) => void };

const ITEMS: Item[] = [
  { title: "Heading 1", hint: "#", keywords: "h1 title", run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { title: "Heading 2", hint: "##", keywords: "h2 subtitle", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { title: "Heading 3", hint: "###", keywords: "h3", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { title: "Bulleted list", hint: "-", keywords: "ul unordered", run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: "Numbered list", hint: "1.", keywords: "ol ordered", run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: "Checklist", hint: "[ ]", keywords: "todo task", run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: "Quote", hint: ">", keywords: "blockquote", run: (e) => e.chain().focus().setBlockquote().run() },
  { title: "Code block", hint: "```", keywords: "pre snippet", run: (e) => e.chain().focus().setCodeBlock().run() },
  { title: "Divider", hint: "---", keywords: "hr rule line", run: (e) => e.chain().focus().setHorizontalRule().run() },
];

const MENU = "z-50 w-60 overflow-hidden rounded-lg border border-line-strong bg-well p-1 shadow-xl shadow-black/40";
const ROW = "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] text-text-2 aria-selected:bg-raised aria-selected:text-text";

function slashMenu() {
  let el: HTMLDivElement | undefined;
  let items: Item[] = [];
  let index = 0;
  let pick: (item: Item) => void = () => {};
  let rect: (() => DOMRect | null) | null | undefined;

  function place() {
    const box = rect?.();
    if (!el || !box) return;
    const below = box.bottom + 6;
    const room = window.innerHeight - below;
    el.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${room < el.offsetHeight + 8 ? Math.max(8, box.top - el.offsetHeight - 6) : below}px`;
  }

  function draw() {
    const menu = el;
    if (!menu) return;
    menu.replaceChildren();
    if (!items.length) {
      const none = document.createElement("div");
      none.className = "px-2 py-1.5 text-[13px] text-muted";
      none.textContent = "No match";
      menu.append(none);
    }
    items.forEach((item, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = ROW;
      row.setAttribute("aria-selected", String(i === index));
      row.addEventListener("mousedown", (e) => e.preventDefault());
      row.addEventListener("mouseenter", () => {
        index = i;
        menu.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
      });
      row.addEventListener("click", () => pick(item));
      const title = document.createElement("span");
      title.textContent = item.title;
      const hint = document.createElement("span");
      hint.className = "font-mono text-[11px] text-faint";
      hint.textContent = item.hint;
      row.append(title, hint);
      menu.append(row);
    });
    menu.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    place();
  }

  return {
    onStart(props: { items: Item[]; clientRect?: (() => DOMRect | null) | null; command: (item: Item) => void }) {
      el = document.createElement("div");
      el.className = `fixed max-h-72 overflow-y-auto ${MENU}`;
      el.setAttribute("role", "listbox");
      document.body.append(el);
      items = props.items;
      index = 0;
      pick = props.command;
      rect = props.clientRect;
      draw();
    },
    onUpdate(props: { items: Item[]; clientRect?: (() => DOMRect | null) | null; command: (item: Item) => void }) {
      items = props.items;
      index = Math.min(index, Math.max(items.length - 1, 0));
      pick = props.command;
      rect = props.clientRect;
      draw();
    },
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (items.length) index = (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        draw();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (items[index]) pick(items[index]);
        return true;
      }
      return false;
    },
    onExit() {
      el?.remove();
      el = undefined;
    },
  };
}

export const SlashMenu = Extension.create({
  name: "slashMenu",
  addProseMirrorPlugins() {
    return [
      Suggestion<Item, Item>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowedPrefixes: [" "],
        items: ({ query }) => {
          const q = query.toLowerCase().trim();
          return ITEMS.filter((i) => !q || `${i.title} ${i.keywords}`.toLowerCase().includes(q));
        },
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: Item }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run(editor);
        },
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        render: slashMenu,
      }),
    ];
  },
});

const MARKS = [
  { label: "B", title: "Bold (Cmd+B)", mark: "bold", cls: "font-bold", run: (e: Editor) => e.chain().focus().toggleBold().run() },
  { label: "I", title: "Italic (Cmd+I)", mark: "italic", cls: "italic", run: (e: Editor) => e.chain().focus().toggleItalic().run() },
  { label: "S", title: "Strikethrough", mark: "strike", cls: "line-through", run: (e: Editor) => e.chain().focus().toggleStrike().run() },
  { label: "</>", title: "Inline code", mark: "code", cls: "font-mono text-[11px]", run: (e: Editor) => e.chain().focus().toggleCode().run() },
];
const BLOCKS = [
  { label: "H1", title: "Heading 1", active: (e: Editor) => e.isActive("heading", { level: 1 }), run: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "H2", title: "Heading 2", active: (e: Editor) => e.isActive("heading", { level: 2 }), run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
];

const BTN = "grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-[12px] font-semibold text-text-2 hover:bg-raised hover:text-text aria-pressed:bg-raised aria-pressed:text-accent";

export const SelectionMenu = Extension.create({
  name: "selectionMenu",
  addProseMirrorPlugins() {
    const editor = this.editor;
    const el = document.createElement("div");
    el.className = `${MENU} flex w-auto items-center gap-0.5`;
    el.style.visibility = "hidden";
    let linking = false;

    const button = (label: string, title: string, cls: string, on: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `${BTN} ${cls}`;
      b.textContent = label;
      b.title = title;
      b.setAttribute("aria-label", title);
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", on);
      return b;
    };

    function drawLink() {
      const input = document.createElement("input");
      input.value = (editor.getAttributes("link").href as string | undefined) ?? "";
      input.placeholder = "https://example.com";
      input.className = "h-7 w-52 rounded-md border border-line bg-ink px-2 text-[13px] text-text outline-none focus:border-line-strong";
      const apply = () => {
        const href = input.value.trim();
        const chain = editor.chain().focus().extendMarkRange("link");
        if (href) chain.setLink({ href }).run();
        else chain.unsetLink().run();
        linking = false;
        draw();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          apply();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          linking = false;
          editor.commands.focus();
          draw();
        }
      });
      el.replaceChildren(input);
      requestAnimationFrame(() => input.focus());
    }

    function draw() {
      if (linking) return drawLink();
      const sep = () => {
        const s = document.createElement("span");
        s.className = "mx-0.5 h-4 w-px bg-line";
        return s;
      };
      const nodes: HTMLElement[] = BLOCKS.map((b) => {
        const node = button(b.label, b.title, "", () => {
          b.run(editor);
          draw();
        });
        node.setAttribute("aria-pressed", String(b.active(editor)));
        return node;
      });
      nodes.push(sep());
      for (const m of MARKS) {
        const node = button(m.label, m.title, m.cls, () => {
          m.run(editor);
          draw();
        });
        node.setAttribute("aria-pressed", String(editor.isActive(m.mark)));
        nodes.push(node);
      }
      nodes.push(sep());
      const link = button("Link", "Link", "", () => {
        linking = true;
        draw();
      });
      link.setAttribute("aria-pressed", String(editor.isActive("link")));
      nodes.push(link);
      el.replaceChildren(...nodes);
    }

    editor.on("selectionUpdate", () => {
      if (!linking) draw();
    });
    editor.on("blur", ({ event }) => {
      if (event && el.contains(event.relatedTarget as Node | null)) return;
      linking = false;
    });

    return [
      BubbleMenuPlugin({
        pluginKey: "selectionMenu",
        editor,
        element: el,
        appendTo: () => document.body,
        updateDelay: 100,
        options: { strategy: "fixed", placement: "top", offset: 8, flip: true, shift: { padding: 8 } },
        shouldShow: ({ state, from, to }) => {
          if (linking) return true;
          if (!editor.isEditable || state.selection.empty || from === to) return false;
          if (editor.isActive("codeBlock")) return false;
          if (!state.doc.textBetween(from, to).trim()) return false;
          draw();
          return true;
        },
      }),
    ];
  },
});
