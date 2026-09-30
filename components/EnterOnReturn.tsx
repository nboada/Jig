"use client";

import { useLayoutEffect, useRef } from "react";

const FLAG = "jig-return";

export function markReturn() {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
  }
}

export function EnterOnReturn({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const returning = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    const article = ref.current;
    if (returning.current === null) {
      try {
        returning.current = sessionStorage.getItem(FLAG) !== null;
        sessionStorage.removeItem(FLAG);
      } catch {
        returning.current = false;
      }
    }
    if (!article || !returning.current) return;
    article.classList.add("form-enter");
    const timer = setTimeout(() => article.classList.remove("form-enter"), 700);
    return () => {
      clearTimeout(timer);
      article.classList.remove("form-enter");
    };
  }, []);

  return (
    <article ref={ref} className={className}>
      {children}
    </article>
  );
}
