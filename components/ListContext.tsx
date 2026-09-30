"use client";

import { createContext, useContext } from "react";
import type { Section } from "@/lib/prefs";
import type { Sort } from "@/lib/sort";


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
  hide: (slug: string) => void;
  unhide: (slug: string) => void;
  pin: (slug: string, pinned: boolean) => void;
  lock: (slug: string, locked: boolean) => void;
  section: Section;
  base: string;
  unlocked: boolean;
};

export const ListContext = createContext<ListState | null>(null);

export function useList() {
  const list = useContext(ListContext);
  if (!list) throw new Error("ListToolbar and ListColumn need a ListFilters around them");
  return list;
}

export function useOptionalList() {
  return useContext(ListContext);
}
