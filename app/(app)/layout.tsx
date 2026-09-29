import { cookies } from "next/headers";
import Link from "next/link";
import { AppShortcuts } from "@/components/AppShortcuts";
import { HeaderActions } from "@/components/HeaderActions";
import { Logo } from "@/components/Logo";
import { PrefsSync } from "@/components/PrefsSync";
import { BottomNav, SectionTitle, TopNav } from "@/components/TopNav";
import { requireAuth } from "@/lib/auth";
import { NAV_ORDER_COOKIE, parseNavOrder } from "@/lib/prefs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const order = parseNavOrder((await cookies()).get(NAV_ORDER_COOKIE)?.value);
  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      {/* A floating bar, inset to line up with the page content. */}
      <header className="sticky top-0 z-20 mx-auto max-w-[90rem] px-3 pt-(--header-gap) md:px-6">
        {/* Three columns so the section tabs sit in the true centre whatever the sides hold. */}
        <div className="grid h-(--header-h) grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-full border border-line bg-bar pr-2 pl-4 shadow-lg shadow-black/25">
          <Link href="/" aria-label="Home" className="flex items-center justify-self-start">
            <Logo />
          </Link>
          <TopNav order={order} className="hidden md:flex" />
          <SectionTitle order={order} className="col-start-2 md:hidden" />
          <div className="col-start-3 justify-self-end">
            <HeaderActions />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[90rem] px-4 pt-6 pb-8 md:px-6">{children}</main>
      <BottomNav order={order} />
      <AppShortcuts order={order} />
      <PrefsSync />
    </div>
  );
}
