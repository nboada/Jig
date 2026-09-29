/** Stroke icons for the section links, drawn on a 24px grid to match the sidebar's text size. */
function Icon({ children, className = "size-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function SnippetsIcon(props: { className?: string }) {
  return (
    <Icon {...props}>
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </Icon>
  );
}

export function NotesIcon(props: { className?: string }) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </Icon>
  );
}

export function CredentialsIcon(props: { className?: string }) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
    </Icon>
  );
}

export function ConnectIcon(props: { className?: string }) {
  return (
    <Icon {...props}>
      <path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" />
    </Icon>
  );
}

export function GridIcon(props: { className?: string }) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  );
}

export function ListIcon(props: { className?: string }) {
  return (
    <Icon {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </Icon>
  );
}

export function PlusIcon(props: { className?: string }) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}
