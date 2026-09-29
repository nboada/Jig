import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { allowApp, denyApp } from "@/app/actions";
import { button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkAuthorizeRequest, OAuthError } from "@/lib/oauth";
import { resourceUrlFrom } from "@/lib/oauth-http";

export const metadata: Metadata = { title: "Connect an app" };

/**
 * The consent screen an app (Claude, say) sends you to when it connects over OAuth. You're signed
 * in by now (the proxy sent you through /login otherwise). Shows who's asking and, more to the
 * point, the site the approval goes back to, since any app can call itself "Claude".
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAuth();
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));

  let problem = "";
  let request: Awaited<ReturnType<typeof checkAuthorizeRequest>> | null = null;
  try {
    request = await checkAuthorizeRequest(await getDb(), params, resourceUrlFrom(await headers()));
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error;
    problem = error.message;
  }
  if (request && "redirect" in request) redirect(request.redirect);

  return (
    <main className="bench relative grid min-h-dvh place-items-center px-4">
      <div className="relative w-full max-w-sm">
        <Logo className="mb-7 text-xl" />
        {!request ? (
          <div className="space-y-4">
            <h1 className="text-[17px] font-semibold">This connection can't go ahead</h1>
            <p className="text-body text-text-2">{problem}</p>
            <Link href="/" className={button({ variant: "secondary", size: "lg" })}>
              Back to Jig
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-[17px] font-semibold">{`${request.client.name} wants to connect to your Jig`}</h1>
              <p className="text-body text-text-2">
                {"Approving sends access back to "}
                <span className="font-mono text-text">{new URL(request.redirectUri).host}</span>
                {". Only allow it if you just started connecting from there."}
              </p>
            </div>
            <div className="space-y-2 rounded-xl border border-line bg-panel p-4 text-ui leading-6 text-text-2">
              <p className="font-medium text-text">It will be able to</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Search and read your snippets and notes</li>
                <li>Create and update them (every change is saved as a new version)</li>
              </ul>
              <p className="pt-1 text-muted">It can't see your credentials or locked notes, or delete anything.</p>
            </div>
            <form className="flex gap-2">
              <input type="hidden" name="params" value={JSON.stringify(params)} />
              <button formAction={allowApp} className={button({ variant: "primary", size: "lg", className: "flex-1" })}>
                Allow
              </button>
              <button formAction={denyApp} className={button({ variant: "secondary", size: "lg", className: "flex-1" })}>
                Deny
              </button>
            </form>
            <p className="text-meta text-muted">You can disconnect it any time on the Connect page.</p>
          </div>
        )}
      </div>
    </main>
  );
}
