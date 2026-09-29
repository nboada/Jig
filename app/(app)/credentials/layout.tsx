import { CredentialColumn, CredentialFilters, CredentialToolbar } from "@/components/CredentialColumn";
import { GridToolbar } from "@/components/GridToolbar";
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
  if (!encryptionReady()) return <div className="@container">{children}</div>;
  if (view === "grid") {
    return (
      <div className="@container">
        <GridToolbar section="credentials" placeholder="Search titles, URLs and labels" newLabel="New credential" />
        {children}
      </div>
    );
  }
  const credentials = await listCredentials(await getDb(), { sort, limit: 500 });
  return (
    <CredentialFilters credentials={credentials} sort={sort}>
      <SplitView base="/credentials" toolbar={<CredentialToolbar />} column={<CredentialColumn />}>
        {children}
      </SplitView>
    </CredentialFilters>
  );
}
