"use client";

import { createContext, useContext } from "react";
import type { Section } from "@/lib/prefs";
import type { Sort } from "@/lib/sort";

/**
 * The split view's shared list state, in its own module so the pieces that use it (the list,
 * the confirm button, the right-click menu) don't import each other in a circle.
 */

export type Item = {
  slug: string;
  title: string;
  tags: string[];
  language?: string;
  url?: string;
  pinned?: boolean;
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListState = {
  query: string;
  setQuery: (value: string) => void;
  language: string;
  setLanguage: (value: string) => void;
  tag: string;
  setTag: (value: string) => void;
  visible: Item[];
  sort: Sort;
  setSort: (sort: Sort) => void;
  /** Takes an item out of the list at once, ahead of the server (after confirming a delete). */
  hide: (slug: string) => void;
  /** Pins or unpins an item in the list at once, ahead of the server. */
  pin: (slug: string, pinned: boolean) => void;
  section: Section;
  base: string;
};

export const ListContext = createContext<ListState | null>(null);

export function useList() {
  const list = useContext(ListContext);
  if (!list) throw new Error("ListToolbar and ListColumn need a ListFilters around them");
  return list;
}

/** The split view's list when there is one around, for pieces that also render outside it. */
export function useOptionalList() {
  return useContext(ListContext);
}
