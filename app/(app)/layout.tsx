import Link from "next/link";
import { logout } from "@/app/actions";
import { Logo } from "@/components/Logo";
import { NewMenu } from "@/components/NewMenu";
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
        <SidebarNav />
        <form action={logout} className="mt-auto px-3">
          <button className="text-sm text-muted hover:text-text">Log out</button>
        </form>
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
          <Link href="/" className="hover:text-text">
            Snippets
          </Link>
          <Link href="/notes" className="hover:text-text">
            Notes
          </Link>
          <Link href="/credentials" className="hover:text-text">
            Credentials
          </Link>
          <Link href="/connect" className="hover:text-text">
            Connect
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
