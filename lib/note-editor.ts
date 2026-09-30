import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

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
