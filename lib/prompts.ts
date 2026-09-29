/** What to paste into an agent to use an item from Jig. Credentials have none: agents can't read them. */
export function agentPrompt(kind: "snippets" | "notes", slug: string): string {
  return kind === "snippets" ? `Add the "${slug}" snippet from Jig to this project.` : `Use my "${slug}" note from Jig.`;
}
