"use client";

import { useLayoutEffect, useRef } from "react";

const FLAG = "jig-return";

/** Called when leaving a new or edit form (Cancel, Esc, Save), so the item page slides in after it. */
export function markReturn() {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // Storage can be off (private windows); then the page just appears without the slide.
  }
}

/**
 * An item page's article. Coming back from its form, it plays the form's entrance in reverse: the
 * title stays where it was and the rest eases up into place. Opened any other way, it just appears.
 * The class goes on before the browser paints, so nothing shows before the slide starts.
 */
export function EnterOnReturn({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  // Whether this page was reached from its form, read once (React may run the effect twice).
  const returning = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    const article = ref.current;
    if (returning.current === null) {
      try {
        returning.current = sessionStorage.getItem(FLAG) !== null;
        sessionStorage.removeItem(FLAG);
      } catch {
        returning.current = false; // No storage, no slide.
      }
    }
    if (!article || !returning.current) return;
    article.classList.add("form-enter");
    // The slide starts from invisible; if the browser never plays it (a background tab doesn't),
    // taking the class off shows the content regardless once the slide should be over.
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
