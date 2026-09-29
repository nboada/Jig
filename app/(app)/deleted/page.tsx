import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { KEEP_DAYS, listTrash } from "@/lib/trash";
import { requireAuth } from "@/lib/auth";
import { DeletedList } from "./DeletedList";

export const metadata: Metadata = { title: "Recently deleted" };

export default async function DeletedPage() {
  await requireAuth();
  const items = await listTrash(await getDb());
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-title font-semibold">Recently deleted</h1>
        <p className="mt-2 text-muted">
          Deleted snippets, notes and credentials stay here for {KEEP_DAYS} days, with their history, and then go for good.
        </p>
      </div>
      {items.length === 0 ? <p className="text-body text-muted">Nothing deleted in the last {KEEP_DAYS} days.</p> : <DeletedList items={items} />}
    </div>
  );
}
