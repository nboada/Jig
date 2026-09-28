import Link from "next/link";
import { logout } from "@/app/actions";
import { Logo } from "@/components/Logo";
import { requireAuth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-ink/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/" className="hidden hover:text-text sm:inline">
              Snippets
            </Link>
            <Link href="/connect" className="hover:text-text">
              Connect
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/snippets/new"
              className="whitespace-nowrap rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:brightness-110"
            >
              New<span className="hidden sm:inline"> snippet</span>
            </Link>
            <form action={logout}>
              <button className="whitespace-nowrap text-sm text-muted hover:text-text">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
