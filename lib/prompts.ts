export function agentPrompt(kind: "snippets" | "notes", slug: string): string {
  return kind === "snippets" ? `Add the "${slug}" snippet from Jig to this project.` : `Use my "${slug}" note from Jig.`;
}
