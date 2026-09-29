import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { CredentialForm } from "@/components/CredentialForm";
import { KeyMissing } from "@/components/KeyMissing";
import { getCredential } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Edit credential" };

export default async function EditCredentialPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!encryptionReady()) return <KeyMissing />;
  const { slug } = await params;
  const credential = await getCredential(await getDb(), slug);
  if (!credential) notFound();
  return (
    <div className="max-w-4xl space-y-6 @6xl:mx-auto">
      <div>
        <BackLink href={`/credentials/${slug}`}>{credential.title}</BackLink>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Edit credential</h1>
      </div>
      <CredentialForm credential={credential} />
    </div>
  );
}
