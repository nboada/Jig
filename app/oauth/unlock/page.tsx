import type { Metadata } from "next";
import Link from "next/link";
import { allowAppUnlock, denyAppUnlock } from "@/app/actions";
import { button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { UnlockPanel } from "@/components/Passkeys";
import { requireAuth } from "@/lib/auth";
import { appGrantFor } from "@/lib/api-locked";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { isUnlocked } from "@/lib/locked-notes";
import { getClient, isAppRedirect } from "@/lib/oauth";
import { hasPasskeys } from "@/lib/passkeys";

export const metadata: Metadata = { title: "Unlock for an app" };

export default async function AppUnlockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAuth();
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const db = await getDb();
  const client = params.client_id ? await getClient(db, params.client_id) : null;
  const registered = client && params.redirect_uri && client.redirectUris.includes(params.redirect_uri) && isAppRedirect(params.redirect_uri);
  const grant = registered ? await appGrantFor(db, client.id) : null;
  const valid = client && grant;
  const unlocked = valid ? await isUnlocked() : false;
  const scheme = registered ? new URL(params.redirect_uri!).protocol.slice(0, -1) : "";

  return (
    <main className="bench relative grid min-h-dvh place-items-center px-4">
      <div className="relative w-full max-w-sm">
        <Logo className="mb-7 text-xl" />
        {!valid ? (
          <div className="space-y-4">
            <h1 className="text-[17px] font-semibold">This unlock can&apos;t go ahead</h1>
            <p className="text-body text-text-2">
              Only an app that&apos;s already signed in to your Jig can ask for this. Sign in from the app again.
            </p>
            <Link href="/" className={button({ variant: "secondary", size: "lg" })}>
              Back to Jig
            </Link>
          </div>
        ) : !unlocked ? (
          <UnlockPanel
            hasPasskey={await hasPasskeys(db)}
            title={`Unlock locked notes for ${client.name}`}
            line="Use your passkey or password, the same as on the dashboard."
          />
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-[17px] font-semibold">{`Let ${client.name} open your locked notes?`}</h1>
              <p className="text-body text-text-2">
                {"Approving sends access back to the app that registered "}
                <span className="font-mono text-text">{scheme}</span>
                {`, connected ${formatDate(grant.createdAt)}. Only allow it if you just tapped Unlock in that app.`}
              </p>
              <p className="text-body text-text-2">
                For the next 30 minutes it can read, edit and copy every locked note, and unlock or lock them. Disconnecting it
                on the Connect page ends this at once.
              </p>
            </div>
            <form className="flex gap-2">
              <input type="hidden" name="params" value={JSON.stringify(params)} />
              <button formAction={allowAppUnlock} className={button({ variant: "primary", size: "lg", className: "flex-1" })}>
                Allow
              </button>
              <button formAction={denyAppUnlock} className={button({ variant: "secondary", size: "lg", className: "flex-1" })}>
                Deny
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
