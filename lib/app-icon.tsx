/**
 * The Jig mark drawn for generated app icons (next/og): lime code chevrons on the app's dark ink.
 * Dark on purpose: in dark mode iOS (and some Android launchers) turn a home-screen icon's
 * background black and keep its symbol, so the old lime square's dark chevrons vanished. Lime on
 * dark reads in both. `maskable` fills the whole canvas and shrinks the mark into the safe zone,
 * for platforms that crop icons into circles or squircles. `monochrome` is Android's themed-icon
 * shape: the chevrons alone, in white on transparent, which the launcher recolours.
 */
export function AppIconArt({ size, maskable = false, monochrome = false }: { size: number; maskable?: boolean; monochrome?: boolean }) {
  const glyph = Math.round(size * (maskable || monochrome ? 0.72 : 0.86));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: monochrome ? "transparent" : "#181818",
        borderRadius: maskable || monochrome ? 0 : Math.round(size * 0.22),
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 32 32">
        <path
          d="M12 10l-6 6 6 6M20 10l6 6-6 6"
          fill="none"
          stroke={monochrome ? "#ffffff" : "#cefd53"}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
