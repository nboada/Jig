/**
 * The Jig mark drawn for generated app icons (next/og): the accent square with the code chevrons.
 * `maskable` fills the whole canvas and shrinks the mark into the safe zone, for platforms that
 * crop icons into circles or squircles.
 */
export function AppIconArt({ size, maskable = false }: { size: number; maskable?: boolean }) {
  const glyph = Math.round(size * (maskable ? 0.66 : 0.8));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#cefd53",
        borderRadius: maskable ? 0 : Math.round(size * 0.22),
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 32 32">
        <path
          d="M12 10l-6 6 6 6M20 10l6 6-6 6"
          fill="none"
          stroke="#1a2106"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
