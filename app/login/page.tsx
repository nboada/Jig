import type { Metadata } from "next";
import { Credit } from "@/components/Credit";
import { Logo } from "@/components/Logo";
import { PasskeyLogin } from "@/components/Passkeys";
import { getDb } from "@/lib/db";
import { hasPasskeys } from "@/lib/passkeys";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // The passkey button only appears once there is a passkey to sign in with.
  const passkey = await getDb().then(hasPasskeys).catch(() => false);
  return (
    <main className="bench relative grid min-h-dvh place-items-center px-4">
      <div className="relative w-full max-w-sm">
        <div className="mb-7 space-y-5">
          <Logo className="text-xl" />
          <p className="text-body text-text-2">Your snippet library, and the one your agents read from.</p>
        </div>
        <LoginForm next={next ?? "/"} />
        {passkey && (
          <div className="mt-3">
            <PasskeyLogin next={next ?? "/"} />
          </div>
        )}
        {/* The password lives in Vercel, so whoever can sign in there can recover it. */}
        <details className="group mt-6 text-ui text-muted">
          <summary className="w-fit cursor-pointer list-none transition hover:text-text [&::-webkit-details-marker]:hidden">
            Forgot your password?
          </summary>
          <div className="mt-3 space-y-2 rounded-xl border border-line bg-panel p-4 leading-6">
            <p className="text-text-2">
              {"It's the "}
              <code className="rounded bg-raised px-1 py-0.5 font-mono text-meta">ADMIN_PASSWORD</code>
              {" setting of this app's Vercel project."}
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                {"Open "}
                <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  your Vercel dashboard
                </a>
                {" and pick this project."}
              </li>
              <li>{"Go to Settings → Environment Variables and find ADMIN_PASSWORD. Reveal it to see it, or edit it to set a new one."}</li>
              <li>{"If you changed it, redeploy (Deployments → ⋯ → Redeploy). New values only apply to new deployments."}</li>
            </ol>
            <p>{"Your snippets, notes and credentials stay as they are."}</p>
          </div>
        </details>
        <Credit className="mt-10" />
      </div>
    </main>
  );
}
