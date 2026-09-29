import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 text-xl" />
        <LoginForm next={next ?? "/"} />
        {/* The password lives in Vercel, so whoever can sign in there can recover it. */}
        <details className="group mt-6 text-sm text-muted">
          <summary className="cursor-pointer list-none hover:text-text [&::-webkit-details-marker]:hidden">
            Forgot your password?
          </summary>
          <div className="mt-3 space-y-2 rounded-lg border border-line bg-panel p-4 leading-6">
            <p className="text-text/85">
              {"It's the "}
              <code className="rounded bg-raised px-1 py-0.5 font-mono text-xs">ADMIN_PASSWORD</code>
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
      </div>
    </main>
  );
}
