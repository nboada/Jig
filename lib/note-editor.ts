import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

/**
 * What the notes editor understands. Notes are stored as markdown, so only formatting markdown
 * can express is on: headings, bold, italic, strikethrough, code, links, lists, task lists,
 * quotes, code blocks and rules. Underline has no markdown form, so it is off.
 */
export const noteExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    underline: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Markdown,
];
