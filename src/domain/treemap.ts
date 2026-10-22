/**
 * Squarified treemap layout (Bruls, Huizing and van Wijk): rectangles whose areas match the values and
 * whose sides stay as close to square as the values allow. Values are laid out largest first.
 */

export interface TreeItem {
  id: string;
  value: number;
}

export interface TreeRect {
  id: string;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const worst = (row: number[], side: number): number => {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
};

export function squarify(
  items: readonly TreeItem[],
  x: number,
  y: number,
  w: number,
  h: number,
): TreeRect[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || w <= 0 || h <= 0) return [];
  // Work in area units so the rectangle's area equals the sum of the scaled values.
  const scale = (w * h) / total;
  const areas = list.map((i) => i.value * scale);
  const out: TreeRect[] = [];
  let rect = { x, y, w, h };
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(rect.w, rect.h);
    const row = [areas[i]!];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]!], side) <= worst(row, side)) {
      row.push(areas[j]!);
      j += 1;
    }
    const rowSum = row.reduce((a, b) => a + b, 0);
    if (rect.w >= rect.h) {
      // A column on the left.
      const colW = rowSum / rect.h;
      let cy = rect.y;
      row.forEach((a, k) => {
        const hh = a / colW;
        out.push({
          id: list[i + k]!.id,
          value: list[i + k]!.value,
          x: rect.x,
          y: cy,
          w: colW,
          h: hh,
        });
        cy += hh;
      });
      rect = { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h };
    } else {
      // A row along the top.
      const rowH = rowSum / rect.w;
      let cx = rect.x;
      row.forEach((a, k) => {
        const ww = a / rowH;
        out.push({
          id: list[i + k]!.id,
          value: list[i + k]!.value,
          x: cx,
          y: rect.y,
          w: ww,
          h: rowH,
        });
        cx += ww;
      });
      rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
    }
    i = j;
  }
  return out;
}
