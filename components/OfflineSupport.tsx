"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function OfflineSupport() {
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  const loaded = useRef(true);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const worker = navigator.serviceWorker.controller;
    if (pathname === "/login") {
      navigator.serviceWorker.getRegistration().then((r) => r?.active?.postMessage("forget"));
    } else if (loaded.current) {
      loaded.current = false;
    } else if (worker && navigator.onLine) {
      worker.postMessage({ save: location.pathname + location.search });
    }
  }, [pathname]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline || pathname === "/login") return null;
  return (
    <div
      role="status"
      className="fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-panel/95 px-3 py-1 text-meta text-text-2 shadow-lg shadow-black/40 backdrop-blur"
    >
      Offline · showing saved copies
    </div>
  );
}
