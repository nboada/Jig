"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { relockNotes, setNoteLock } from "@/app/actions";
import { iconButton } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { LockIcon, UnlockIcon } from "@/components/NavIcons";
import { Tip } from "@/components/Tooltip";

/**
 * The lock beside a note's pin. On an unlocked note it locks it at once; on a locked note that's
 * open it locks it again before the few minutes are up; on one that's shut it just says so (the
 * panel below does the unlocking). Taking the lock off stays in the ⋯ menu, behind a confirm.
 */
export function LockButton({ slug, locked, readable }: { slug: string; locked: boolean; readable: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (locked && !readable) {
    return (
      <Tip label="Locked">
        <span aria-label="Locked" role="img" className={iconButton({ className: "cursor-default text-accent hover:bg-transparent hover:text-accent" })}>
          <LockIcon className="size-4" />
        </span>
      </Tip>
    );
  }

  const label = locked ? "Lock again now" : "Lock note";
  return (
    <>
      <Tip label={label}>
        <button
          type="button"
          aria-label={label}
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (locked) await relockNotes();
              else {
                const result = await setNoteLock(slug, true);
                if (result.error) return setError(result.error);
              }
              router.refresh();
            })
          }
          className={iconButton({ className: locked ? "text-accent hover:text-accent" : "" })}
        >
          {locked ? <LockIcon className="size-4" /> : <UnlockIcon className="size-4" />}
        </button>
      </Tip>
      <Modal open={Boolean(error)} onOpenChange={(open) => !open && setError("")} title="Couldn't lock the note">
        <p className="mt-3 text-body text-text-2">{error}</p>
      </Modal>
    </>
  );
}
