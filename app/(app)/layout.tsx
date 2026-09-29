import Link from "next/link";
import { logout } from "@/app/actions";
import { Logo } from "@/components/Logo";
import { AppShortcuts } from "@/components/AppShortcuts";
import { ConnectLink, TopNav } from "@/components/TopNav";
import { requireAuth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur">
        {/* Three columns so the section tabs sit in the true centre whatever the sides hold. */}
        <div className="mx-auto grid h-14 max-w-[88rem] grid-cols-[1fr_auto_1fr] items-center gap-6 px-4 md:px-8">
          <Link href="/" aria-label="Home" className="justify-self-start">
            <Logo />
          </Link>
          <TopNav className="hidden md:flex" />
          <div className="col-start-3 flex items-center gap-4 justify-self-end">
            <ConnectLink className="hidden md:flex" />
            <form action={logout}>
              <button className="whitespace-nowrap text-sm text-muted hover:text-text">Log out</button>
            </form>
          </div>
        </div>
        <TopNav withConnect className="flex overflow-x-auto px-3 pb-2 md:hidden" />
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[88rem] px-4 py-8 md:px-8">{children}</main>
      <AppShortcuts />
    </div>
  );
}
