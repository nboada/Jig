import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { allowApp, denyApp } from "@/app/actions";
import { button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkAuthorizeRequest, isAppRedirect, OAuthError } from "@/lib/oauth";
import { resourceUrlFrom } from "@/lib/oauth-http";

export const metadata: Metadata = { title: "Connect an app" };

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
  const native = request ? isAppRedirect(request.redirectUri) : false;
  const where = request ? (native ? new URL(request.redirectUri).protocol.slice(0, -1) : new URL(request.redirectUri).host) : "";

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
              <h1 className="text-[17px] font-semibold">
                {native ? "An app on this device wants to connect to your Jig" : (
                  <>
                    <span className="font-mono">{where}</span>
                    {" wants to connect to your Jig"}
                  </>
                )}
              </h1>
              <p className="text-body text-text-2">
                {native ? (
                  <>
                    {"Approving sends access back to the app that registered "}
                    <span className="font-mono text-text">{where}</span>
                    {". Only allow it if you just started signing in from that app."}
                  </>
                ) : (
                  <>
                    {"Approving sends access back to "}
                    <span className="font-mono text-text">{where}</span>
                    {". Only allow it if you just started connecting from there."}
                  </>
                )}
              </p>
              <p className="text-meta text-muted">
                {"It calls itself "}
                <span className="text-text-2">{request.client.name}</span>
                {", but any app can pick any name."}
              </p>
            </div>
            <div className="space-y-2 rounded-xl border border-line bg-panel p-4 text-ui leading-6 text-text-2">
              <p className="font-medium text-text">
                {"Access requested: "}
                <span className="font-mono">{request.scope}</span>
              </p>
              {request.scope === "app" ? (
                <>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Read, create, update, pin, copy and delete your snippets and notes</li>
                    <li>List your credentials and restore or permanently delete items in Recently deleted</li>
                    <li>Create and revoke share links, and list or remove API tokens, connected apps and passkeys</li>
                    <li>Sign you out everywhere</li>
                    <li>Use and change the AI keys saved in Jig</li>
                    <li>Reveal secrets and locked notes only after you unlock them again</li>
                  </ul>
                  <p className="pt-1 text-muted">This is the full app access Jig's own iPhone and Mac apps use. Only allow it for an app you installed yourself.</p>
                </>
              ) : (
                <>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Search and read your snippets and notes</li>
                    <li>Create and update them (every change is saved as a new version)</li>
                  </ul>
                  <p className="pt-1 text-muted">It can't see your credentials or locked notes, or delete anything.</p>
                </>
              )}
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
