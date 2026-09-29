import { Suspense } from "react";
import { CredentialColumn, CredentialFilters, CredentialToolbar } from "@/components/CredentialColumn";
import { SplitView } from "@/components/SplitView";
import { listCredentials } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { getListPrefs } from "@/lib/view";

/**
 * In list view, credentials open beside a column listing them all. In grid view, or before the
 * encryption key is set up, the pages get the full width.
 */
export default async function CredentialsLayout({ children }: { children: React.ReactNode }) {
  const { view, sort } = await getListPrefs("credentials");
  if (view === "grid" || !encryptionReady()) return <div className="@container">{children}</div>;
  const credentials = await listCredentials(await getDb(), { sort, limit: 500 });
  return (
    // The filters read ?q= and ?tag= from the URL, which needs a Suspense boundary.
    <Suspense>
      <CredentialFilters credentials={credentials} sort={sort}>
        <SplitView base="/credentials" toolbar={<CredentialToolbar />} column={<CredentialColumn />}>
          {children}
        </SplitView>
      </CredentialFilters>
    </Suspense>
  );
}
