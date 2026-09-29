import Link from "next/link";
import { logout } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Logo } from "@/components/Logo";
import { LogoutIcon } from "@/components/NavIcons";
import { AppShortcuts } from "@/components/AppShortcuts";
import { ConnectLink, TopNav } from "@/components/TopNav";
import { requireAuth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="min-h-dvh">
      {/* A floating bar, inset to line up with the page content. */}
      <header className="sticky top-0 z-20 mx-auto max-w-[88rem] px-4 pt-3 md:px-8">
        {/* Three columns so the section tabs sit in the true centre whatever the sides hold. */}
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-full bg-bar pr-3 pl-5 shadow-lg shadow-black/40">
          <Link href="/" aria-label="Home" className="flex items-center justify-self-start">
            <Logo />
          </Link>
          <TopNav className="hidden md:flex" />
          <div className="col-start-3 flex items-center gap-3 justify-self-end">
            <ConnectLink className="hidden md:grid" />
            <span className="hidden h-5 w-px bg-line md:block" aria-hidden />
            <form action={logout}>
              <ConfirmButton
                title="Log out?"
                confirmLabel="Log out"
                message="You'll need your password to get back in."
                className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 text-sm font-medium text-text/85 transition hover:bg-line hover:text-text"
              >
                <LogoutIcon className="size-4" />
                Log out
              </ConfirmButton>
            </form>
          </div>
        </div>
        <TopNav withConnect className="mt-2 flex w-fit max-w-full overflow-x-auto md:hidden" />
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[88rem] px-6 py-8 md:px-16">{children}</main>
      <AppShortcuts />
    </div>
  );
}
