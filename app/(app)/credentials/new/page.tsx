import type { Metadata } from "next";
import { CredentialForm } from "@/components/CredentialForm";
import { KeyMissing } from "@/components/KeyMissing";
import { encryptionReady } from "@/lib/crypto";

export const metadata: Metadata = { title: "New credential" };

export default function NewCredentialPage() {
  if (!encryptionReady()) return <KeyMissing />;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New credential</h1>
      <CredentialForm />
    </div>
  );
}
