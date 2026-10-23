/**
 * The two chart scales Ledger uses, written out (Drop 13) so start-up does not carry all of d3-scale
 * and its colour and number-format code. They behave like d3's scaleLinear (with nice and ticks) and
 * scaleBand; scale.test.ts checks them against d3.
 */

const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

function tickSpec(start: number, stop: number, count: number): [number, number, number] {
  const step = (stop - start) / Math.max(0, count);
  const power = Math.floor(Math.log10(step));
  const error = step / 10 ** power;
  const factor = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;
  let i1: number;
  let i2: number;
  let inc: number;
  if (power < 0) {
    inc = 10 ** -power / factor;
    i1 = Math.round(start * inc);
    i2 = Math.round(stop * inc);
    if (i1 / inc < start) ++i1;
    if (i2 / inc > stop) --i2;
    inc = -inc;
  } else {
    inc = 10 ** power * factor;
    i1 = Math.round(start / inc);
    i2 = Math.round(stop / inc);
    if (i1 * inc < start) ++i1;
    if (i2 * inc > stop) --i2;
  }
  if (i2 < i1 && count >= 0.5 && count < 2) return tickSpec(start, stop, count * 2);
  return [i1, i2, inc];
}

function ticks(start: number, stop: number, count: number): number[] {
  if (!(count > 0)) return [];
  if (start === stop) return [start];
  const [i1, i2, inc] = tickSpec(start, stop, count);
  if (!(i2 >= i1)) return [];
  const out: number[] = [];
  for (let i = i1; i <= i2; i += 1) out.push(inc < 0 ? i / -inc : i * inc);
  return out;
}

export interface LinearScale {
  (value: number): number;
  /** From a position in the range back to a value. */
  invert(position: number): number;
  domain(): [number, number];
  ticks(count: number): number[];
}

/** A linear scale from `domain` to `range`; with `nice`, the domain is rounded out as d3's nice(n). */
export function linearScale(
  domain: [number, number],
  range: [number, number],
  nice?: number,
): LinearScale {
  let [d0, d1] = domain;
  if (nice !== undefined && d1 >= d0) {
    // As d3: round out until the step settles; the domain only changes once it does.
    let start = d0;
    let stop = d1;
    let previous: number | undefined;
    for (let i = 0; i < 10; i += 1) {
      const step = tickSpec(start, stop, nice)[2];
      if (step === previous) {
        d0 = start;
        d1 = stop;
        break;
      }
      if (step > 0) {
        start = Math.floor(start / step) * step;
        stop = Math.ceil(stop / step) * step;
      } else if (step < 0) {
        start = Math.ceil(start * step) / step;
        stop = Math.floor(stop * step) / step;
      } else break;
      previous = step;
    }
  }
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((v: number) =>
    span ? r0 + ((v - d0) / span) * (r1 - r0) : r0 + 0.5 * (r1 - r0)) as LinearScale;
  scale.invert = (p: number) => (r1 !== r0 ? d0 + ((p - r0) / (r1 - r0)) * span : d0 + 0.5 * span);
  scale.domain = () => [d0, d1];
  scale.ticks = (count: number) => ticks(d0, d1, count);
  return scale;
}

export interface BandScale {
  (key: string): number | undefined;
  bandwidth(): number;
  step(): number;
  paddingInner(): number;
}

/** Evenly spaced bands for `keys` across `range`, with the same inner and outer padding (0 to 1). */
export function bandScale(
  keys: readonly string[],
  range: [number, number],
  padding: number,
): BandScale {
  const [r0, r1] = range;
  const n = keys.length;
  const step = (r1 - r0) / Math.max(1, n - padding + padding * 2);
  const start = r0 + (r1 - r0 - step * (n - padding)) * 0.5;
  const index = new Map(keys.map((k, i) => [k, i]));
  const scale = ((key: string) => {
    const i = index.get(key);
    return i === undefined ? undefined : start + step * i;
  }) as BandScale;
  scale.bandwidth = () => step * (1 - padding);
  scale.step = () => step;
  scale.paddingInner = () => padding;
  return scale;
}
