import { CredentialColumn, CredentialFilters } from "@/components/CredentialColumn";
import { GridToolbar } from "@/components/GridToolbar";
import { SplitView } from "@/components/SplitView";
import { listCredentials } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { getListPrefs } from "@/lib/view";
import { requireAuth } from "@/lib/auth";

export default async function CredentialsLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
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
      <SplitView base="/credentials" column={<CredentialColumn />}>
        {children}
      </SplitView>
    </CredentialFilters>
  );
}
