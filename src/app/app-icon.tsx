/** The app icon: a cream cross on the reader's burgundy accent. Drawn with shapes, not a font glyph. */
export function AppIcon({ size, rounded }: { size: number; rounded: number }) {
  const bar = Math.round(size * 0.13);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#8a2b2b",
        borderRadius: size * rounded,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* upright */}
      <div style={{ position: "absolute", width: bar, height: size * 0.62, background: "#fffdf8", borderRadius: bar * 0.2, top: size * 0.19 }} />
      {/* crossbar, set high like a Latin cross */}
      <div style={{ position: "absolute", width: size * 0.44, height: bar, background: "#fffdf8", borderRadius: bar * 0.2, top: size * 0.34 }} />
    </div>
  );
}
