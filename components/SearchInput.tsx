"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LanguageSelect } from "@/components/LanguageSelect";
import { SearchIcon } from "@/components/NavIcons";

/** Replaces one search param in the current URL without a full page load, keeping the others. */
export function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }
  return { params, setParam, pending };
}

/** A search box that filters as you type, 250ms after the last keystroke. Enter applies it at once. */
export function SearchInput({ placeholder }: { placeholder: string }) {
  const { params, setParam, pending } = useSetParam();
  const q = params.get("q") ?? "";
  const [value, setValue] = useState(q);
  const input = useRef<HTMLInputElement>(null);

  // Follow the URL when it changes from elsewhere (e.g. "Clear filters"), but never while the user is typing.
  useEffect(() => {
    if (document.activeElement !== input.current) setValue(q);
  }, [q]);

  useEffect(() => {
    if (value.trim() === q) return;
    const timer = setTimeout(() => setParam("q", value.trim()), 250);
    return () => clearTimeout(timer);
    // setParam changes identity with every render; the timer only needs to reset when the text or URL does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, q]);

  return (
    <label className="relative flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-well px-2.5 text-faint transition focus-within:border-line-strong">
      <SearchIcon className="size-3.5" />
      <input
        ref={input}
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          setParam("q", value.trim());
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent pr-5 text-ui text-text outline-none placeholder:text-faint"
      />
      {pending && (
        <span
          aria-hidden
          className="absolute top-1/2 right-2.5 size-3 -translate-y-1/2 animate-spin rounded-full border-2 border-muted border-t-transparent"
        />
      )}
    </label>
  );
}

/** The language filter: applies as soon as the choice changes. */
export function LanguageFilter({ className }: { className?: string }) {
  const { params, setParam } = useSetParam();
  return (
    <LanguageSelect
      value={params.get("lang") ?? ""}
      onChange={(value) => setParam("lang", value)}
      allLabel="All languages"
      size="sm"
      className={className}
    />
  );
}
