import type { Metadata } from "next";
import { CredentialForm } from "@/components/CredentialForm";
import { KeyMissing } from "@/components/KeyMissing";
import { encryptionReady } from "@/lib/crypto";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "New credential" };

export default async function NewCredentialPage() {
  await requireAuth();
  if (!encryptionReady()) return <KeyMissing />;
  return (
    <div>
      <CredentialForm
        header={{ eyebrow: "New credential" }}
      />
    </div>
  );
}
