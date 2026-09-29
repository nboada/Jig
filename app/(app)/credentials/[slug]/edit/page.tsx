import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CredentialForm } from "@/components/CredentialForm";
import { KeyMissing } from "@/components/KeyMissing";
import { getCredential } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit credential" };

export default async function EditCredentialPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAuth();
  if (!encryptionReady()) return <KeyMissing />;
  const { slug } = await params;
  const credential = await getCredential(await getDb(), slug);
  if (!credential) notFound();
  return (
    <div>
      <CredentialForm
        credential={credential}
        header={{
          eyebrow: "Edit credential",
        }}
      />
    </div>
  );
}
