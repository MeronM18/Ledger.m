import type { CSSProperties } from "react";

// Shared by every chart tooltip so none of them can sit on top of what the
// chart is showing: pushed further from the pointer, above the chart's own
// labels, and never intercepting the mouse (which would make it flicker).
export const chartTooltipProps = {
  offset: 24,
  isAnimationActive: false,
  wrapperStyle: { zIndex: 50, pointerEvents: "none" } as CSSProperties,
};

// Shared by every ResponsiveContainer. While the sidebar slides open or shut
// the page resizes every frame; redrawing a chart at every width makes the
// slide stutter, so a chart redraws once, just after resizing stops, and
// until then is clipped to its box rather than spilling past its card.
export const CHART_RESIZE = {
  debounce: 120,
  style: { overflow: "hidden" } as CSSProperties,
};
