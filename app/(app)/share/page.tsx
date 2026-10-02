import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { ShareForm } from "./ShareForm";

export const metadata: Metadata = { title: "Save shared" };

type Search = { title?: string; text?: string; url?: string };

const CODE = /[{};]\s*$|=>|<\/\w+>|^\s*(import|export|const|let|function|def|class|return|<\?php|@media|\$)\b/m;

export default async function SharePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAuth();
  const { title = "", text = "", url = "" } = await searchParams;
  const body = url && !text.includes(url) ? [text, url].filter(Boolean).join("\n\n") : text;
  const lines = body.split("\n").length;
  return (
    <ShareForm
      ai={await aiEnabled()}
      title={title.trim()}
      body={body}
      kind={!url && lines > 1 && CODE.test(body) ? "snippet" : "note"}
    />
  );
}
