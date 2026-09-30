"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { iconButton } from "@/components/Button";
import { menuContentClass, menuItemClass, useItemActions } from "@/components/ItemActions";
import { Modal } from "@/components/Modal";
import { MoreIcon } from "@/components/NavIcons";
import { Tip } from "@/components/Tooltip";
import type { Section } from "@/lib/prefs";

const ON_PAGE = new Set(["pin", "share"]);

export function MoreMenu({
  kind,
  slug,
  title,
  url,
  pinned = false,
  locked = false,
  latest = true,
  versions = 1,
  details,
}: {
  kind: Section;
  slug: string;
  title: string;
  url?: string;
  pinned?: boolean;
  locked?: boolean;
  latest?: boolean;
  versions?: number;
  details: React.ReactNode;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const { actions: all, danger, dialogs } = useItemActions({
    kind,
    slug,
    title,
    url,
    pinned,
    locked,
    latest,
    versions,
    newTab: false,
    onDetails: () => setShowDetails(true),
  });
  const actions = all.filter(({ key }) => !ON_PAGE.has(key));

  return (
    <>
      <DropdownMenu.Root>
        <Tip label="More">
          <DropdownMenu.Trigger aria-label="More actions" className={iconButton()}>
            <MoreIcon className="size-4" />
          </DropdownMenu.Trigger>
        </Tip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className={menuContentClass}>
            {actions.map(({ key, label, icon: Icon, onSelect }) => (
              <DropdownMenu.Item key={key} onSelect={onSelect} className={menuItemClass()}>
                <Icon className="size-4 text-muted" />
                {label}
              </DropdownMenu.Item>
            ))}
            {danger.length > 0 && <DropdownMenu.Separator className="mx-1 my-1 h-px bg-line" />}
            {danger.map(({ key, label, icon: Icon, onSelect }) => (
              <DropdownMenu.Item key={key} onSelect={onSelect} className={menuItemClass(true)}>
                <Icon className="size-4" />
                {label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Modal open={showDetails} onOpenChange={setShowDetails} title={title}>
        {details}
      </Modal>
      {dialogs}
    </>
  );
}
