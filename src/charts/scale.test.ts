import { scaleBand, scaleLinear } from 'd3-scale';
import { describe, expect, it } from 'vitest';
import { bandScale, linearScale } from './scale';

describe('chart scales', () => {
  it('match d3 for the month bars and sparklines', () => {
    for (const max of [0, 1, 7, 99, 1234, 56_789, 1_23_456_78, 9_99_99_999, 0.37]) {
      const ours = linearScale([0, max * 1.1], [190, 10], 4);
      const theirs = scaleLinear()
        .domain([0, max * 1.1])
        .nice(4)
        .range([190, 10]);
      expect(ours.domain()).toEqual(theirs.domain());
      expect(ours.ticks(4)).toEqual(theirs.ticks(4));
      for (const v of [0, max / 3, max]) expect(ours(v)).toBeCloseTo(theirs(v), 9);
      for (const p of [10, 77, 190]) expect(ours.invert(p)).toBeCloseTo(theirs.invert(p), 6);
    }
    const plain = linearScale([0, 5], [2, 98]);
    const d3plain = scaleLinear().domain([0, 5]).range([2, 98]);
    for (const v of [0, 1, 2.5, 5]) expect(plain(v)).toBeCloseTo(d3plain(v), 9);
  });

  it('lay out bands like d3', () => {
    for (const keys of [
      ['a'],
      ['a', 'b', 'c'],
      ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
    ]) {
      const ours = bandScale(keys, [40, 600], 0.35);
      const theirs = scaleBand<string>().domain(keys).range([40, 600]).padding(0.35);
      expect(ours.bandwidth()).toBeCloseTo(theirs.bandwidth(), 9);
      expect(ours.step()).toBeCloseTo(theirs.step(), 9);
      for (const k of keys) expect(ours(k)).toBeCloseTo(theirs(k)!, 9);
      expect(ours('missing')).toBeUndefined();
    }
  });
});
