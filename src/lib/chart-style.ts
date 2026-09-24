import type { CSSProperties } from "react";

// Shared by every chart tooltip so none of them can sit on top of what the
// chart is showing: pushed further from the pointer, above the chart's own
// labels, and never intercepting the mouse (which would make it flicker).
export const chartTooltipProps = {
  offset: 24,
  isAnimationActive: false,
  wrapperStyle: { zIndex: 50, pointerEvents: "none" } as CSSProperties,
};
