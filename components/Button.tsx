/**
 * The app's button styles, as class strings so a <button>, a <Link> or a Radix trigger can all
 * wear them. Every control is one of three heights: 28 (sm), 32 (md) or 40 (lg).
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent font-semibold text-accent-ink hover:brightness-110",
  secondary: "border border-line text-text hover:border-line-strong hover:bg-raised",
  ghost: "text-text-2 hover:bg-raised hover:text-text",
  danger: "bg-danger font-semibold text-ink hover:brightness-110",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-meta",
  md: "h-8 gap-2 rounded-lg px-3.5 text-ui",
  lg: "h-10 gap-2 rounded-lg px-4 text-body",
};

export function button({ variant = "secondary", size = "md", className = "" }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

/** A square icon-only button: quiet until hovered. Give it an aria-label. */
export function iconButton({ size = "sm", className = "" }: { size?: "sm" | "md"; className?: string } = {}) {
  return `grid shrink-0 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-text data-[state=open]:bg-raised data-[state=open]:text-text ${
    size === "sm" ? "size-7" : "size-8"
  } ${className}`;
}
