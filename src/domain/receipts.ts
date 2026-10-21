export const RECEIPT_MAX_EDGE = 1600;
export const RECEIPT_QUALITY = 0.8;

/** Scales a width and height down (never up) so the longest edge is at most `max`. */
export function fitWithin(
  width: number,
  height: number,
  max: number = RECEIPT_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
