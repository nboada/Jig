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
