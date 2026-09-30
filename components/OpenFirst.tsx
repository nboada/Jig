"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOptionalList } from "@/components/ListContext";

export function OpenFirst({ empty }: { empty: React.ReactNode }) {
  const router = useRouter();
  const list = useOptionalList();
  const first = list?.visible[0];
  useEffect(() => {
    if (!first || !list || !window.matchMedia("(min-width: 768px)").matches) return;
    router.replace(`${list.base}/${first.slug}`);
  }, [first, list, router]);
  return first ? <ItemSkeleton /> : <>{empty}</>;
}

function ItemSkeleton() {
  const bar = "rounded-md bg-raised";
  return (
    <div aria-hidden className="animate-pulse space-y-7">
      <div className="space-y-2">
        <div className={`${bar} h-3 w-20`} />
        <div className="flex items-center justify-between gap-4">
          <div className={`${bar} h-8 w-72 max-w-[60%]`} />
          <div className={`${bar} h-8 w-40`} />
        </div>
        <div className={`${bar} h-3 w-32`} />
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-well px-7 py-6">
        {["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"].map((w, i) => (
          <div key={i} className={`${bar} h-3 ${w}`} />
        ))}
      </div>
    </div>
  );
}
