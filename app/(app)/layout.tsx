import Link from "next/link";
import { logout } from "@/app/actions";
import { Logo } from "@/components/Logo";
import { ConnectIcon, CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";
import { NewMenu } from "@/components/NewMenu";
import { NewShortcut } from "@/components/NewShortcut";
import { SidebarNav } from "@/components/SidebarNav";
import { requireAuth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line px-3 py-4 md:sticky md:top-0 md:flex md:h-dvh">
        <Link href="/" className="mb-6 px-3">
          <Logo />
        </Link>
        <SidebarNav>
          <form action={logout} className="px-3">
            <button className="text-sm text-muted hover:text-text">Log out</button>
          </form>
        </SidebarNav>
      </aside>

      <header className="sticky top-0 z-10 border-b border-line bg-ink/85 backdrop-blur md:hidden">
        <div className="flex h-14 items-center gap-4 px-4">
          <Link href="/">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <NewMenu
              items={[
                { href: "/snippets/new", label: "Snippet" },
                { href: "/notes/new", label: "Note" },
                { href: "/credentials/new", label: "Credential" },
              ]}
            />
            <form action={logout}>
              <button className="whitespace-nowrap text-sm text-muted hover:text-text">Log out</button>
            </form>
          </div>
        </div>
        <nav className="flex gap-5 px-4 pb-2.5 text-sm text-muted">
          <Link href="/snippets" className="flex items-center gap-1.5 hover:text-text">
            <SnippetsIcon className="size-3.5" />
            Snippets
          </Link>
          <Link href="/notes" className="flex items-center gap-1.5 hover:text-text">
            <NotesIcon className="size-3.5" />
            Notes
          </Link>
          <Link href="/credentials" className="flex items-center gap-1.5 hover:text-text">
            <CredentialsIcon className="size-3.5" />
            Credentials
          </Link>
          <Link href="/connect" className="flex items-center gap-1.5 hover:text-text">
            <ConnectIcon className="size-3.5" />
            Connect
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 md:px-8">{children}</main>
      <NewShortcut />
    </div>
  );
}
