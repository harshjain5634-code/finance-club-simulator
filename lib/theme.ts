// SVG presentation attributes can't reliably read CSS variables, so charts use these mirrors of globals.css.
export const chartColors = {
  accent: "#4b8bf5",
  positive: "#22c55e",
  negative: "#f05252",
  grid: "#1f2633",
  axis: "#7a8497",
  cursor: "#2b3444",
  canvas: "#0b0f16",
} as const;
