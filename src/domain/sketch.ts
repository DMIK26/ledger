/**
 * The sketch layer's pure geometry: simplifying strokes, snapping held strokes to shapes, the size cap,
 * and turning points into SVG paths. Coordinates are CSS pixels relative to the page content.
 */

/** x, y and pen pressure (0 to 1; a mouse reports 0.5). */
export type Pt = [number, number, number];

export const SKETCH_COLORS = ['ink', 'clay', 'blue', 'green'] as const;
export type SketchColor = (typeof SKETCH_COLORS)[number];
export type SketchTool = 'pen' | 'highlighter';

export interface Stroke {
  id: string;
  tool: SketchTool;
  color: SketchColor;
  points: Pt[];
}

/** One page's drawing for one month. */
export interface Sketch {
  /** `${page}|${month}`, see sketchId(). */
  id: string;
  page: string;
  month: string;
  strokes: Stroke[];
  updatedAt: number;
}

export const RDP_EPSILON = 0.8;
export const SKETCH_CAP_BYTES = 200 * 1024;
export const SNAP_HOLD_MS = 400;

export const sketchId = (page: string, month: string): string => `${page}|${month}`;

const round1 = (n: number): number => Math.round(n * 10) / 10;

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer-Douglas-Peucker on x and y; pressure rides along. Coordinates are rounded to 0.1px. */
export function simplify(points: readonly Pt[], epsilon: number = RDP_EPSILON): Pt[] {
  if (points.length <= 2) return points.map((p) => [round1(p[0]), round1(p[1]), round1(p[2])]);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    let max = 0;
    let index = -1;
    for (let i = s + 1; i < e; i += 1) {
      const d = distToSegment(points[i]!, points[s]!, points[e]!);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== -1 && max > epsilon) {
      keep[index] = true;
      stack.push([s, index], [index, e]);
    }
  }
  return points
    .filter((_, i) => keep[i])
    .map((p) => [round1(p[0]), round1(p[1]), round1(p[2])] as Pt);
}

function pathLength(points: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i += 1)
    len += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  return len;
}

export type ShapeKind = 'line' | 'circle' | 'rect';

/**
 * Recognises a held stroke as a straight line, a circle (or ellipse) or a rectangle and returns the
 * clean shape, or null when it is none of them. Used after the pen rests for 400ms.
 */
export function detectShape(points: readonly Pt[]): { kind: ShapeKind; points: Pt[] } | null {
  if (points.length < 3) return null;
  const length = pathLength(points);
  if (length < 24) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const pressure = points.reduce((s, p) => s + p[2], 0) / points.length;
  const chord = Math.hypot(last[0] - first[0], last[1] - first[1]);

  // A line: the ends are far apart and nothing strays far from the chord.
  if (chord > length * 0.9) {
    const dev = Math.max(...points.map((p) => distToSegment(p, first, last)));
    if (dev < Math.max(4, chord * 0.06)) {
      return { kind: 'line', points: [first, [last[0], last[1], pressure]] };
    }
  }

  // Closed shapes: the stroke ends near where it began.
  if (chord > length * 0.2) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 12 || h < 12) return null;
  if (chord > Math.max(w, h) * 0.3) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = w / 2;
  const ry = h / 2;

  // How far each point is from an ellipse and from the bounding box, relative to the shape's size.
  const size = Math.min(w, h);
  const ellipseErr =
    points.reduce((s, p) => {
      const r = Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry);
      return s + Math.abs(r - 1) * Math.min(rx, ry);
    }, 0) /
    points.length /
    size;
  const rectErr =
    points.reduce(
      (s, p) =>
        s +
        Math.min(
          Math.abs(p[0] - minX),
          Math.abs(p[0] - maxX),
          Math.abs(p[1] - minY),
          Math.abs(p[1] - maxY),
        ),
      0,
    ) /
    points.length /
    size;

  // A box touches all four sides, not just two.
  const near = (v: number, edge: number) => Math.abs(v - edge) < size * 0.12;
  const touchesAll =
    points.some((p) => near(p[0], minX)) &&
    points.some((p) => near(p[0], maxX)) &&
    points.some((p) => near(p[1], minY)) &&
    points.some((p) => near(p[1], maxY));
  if (rectErr < 0.06 && rectErr < ellipseErr && touchesAll) {
    const corners: Pt[] = [
      [minX, minY, pressure],
      [maxX, minY, pressure],
      [maxX, maxY, pressure],
      [minX, maxY, pressure],
      [minX, minY, pressure],
    ];
    return { kind: 'rect', points: corners.map((p) => [round1(p[0]), round1(p[1]), round1(p[2])]) };
  }
  if (ellipseErr < 0.1) {
    const out: Pt[] = [];
    for (let i = 0; i <= 36; i += 1) {
      const a = (i / 36) * Math.PI * 2;
      out.push([round1(cx + rx * Math.cos(a)), round1(cy + ry * Math.sin(a)), round1(pressure)]);
    }
    return { kind: 'circle', points: out };
  }
  return null;
}

/** Stored size of a drawing, as the JSON it is saved as. */
export const sketchBytes = (strokes: readonly Stroke[]): number =>
  new TextEncoder().encode(JSON.stringify(strokes)).length;

/** Drops the oldest strokes until the drawing fits the cap (200KB per page and month). */
export function fitCap(strokes: readonly Stroke[], cap: number = SKETCH_CAP_BYTES): Stroke[] {
  const out = [...strokes];
  while (out.length > 1 && sketchBytes(out) > cap) out.shift();
  return out;
}

/** Stroke width for a tool at a given pressure. */
export function strokeWidth(tool: SketchTool, pressure: number): number {
  const p = Number.isFinite(pressure) && pressure > 0 ? pressure : 0.5;
  return tool === 'highlighter' ? 14 : round1(1.2 + p * 2.4);
}

/** A smooth path through the points (quadratic curves through the midpoints). */
export function strokePath(points: readonly Pt[]): string {
  if (points.length === 0) return '';
  const [x0, y0] = points[0]!;
  if (points.length === 1) return `M${x0} ${y0}l0.1 0`;
  if (points.length === 2) return `M${x0} ${y0}L${points[1]![0]} ${points[1]![1]}`;
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x, y] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    d += `Q${x} ${y} ${round1((x + nx) / 2)} ${round1((y + ny) / 2)}`;
  }
  const end = points[points.length - 1]!;
  return `${d}L${end[0]} ${end[1]}`;
}

/** True when (x, y) is within `radius` of the stroke's line (the eraser removes whole strokes). */
export function hitsStroke(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const pts = stroke.points;
  const reach = radius + strokeWidth(stroke.tool, 0.5) / 2;
  if (pts.length === 1) return Math.hypot(pts[0]![0] - x, pts[0]![1] - y) <= reach;
  for (let i = 1; i < pts.length; i += 1) {
    if (distToSegment([x, y, 0], pts[i - 1]!, pts[i]!) <= reach) return true;
  }
  return false;
}
