import { describe, expect, test } from 'vitest';
import { arcPositions, clockwiseFrom, ellipsePositions } from './layout';

const circle = { cx: 50, cy: 50, rx: 40, ry: 40 };

describe('clockwiseFrom', () => {
  test('puts my seat first and continues clockwise, wrapping around', () => {
    expect(clockwiseFrom([0, 2, 3, 5, 7], 3)).toEqual([3, 5, 7, 0, 2]);
  });

  test('starts with the next seat after mine when mine is not in the list', () => {
    expect(clockwiseFrom([0, 2, 5], 3)).toEqual([5, 0, 2]);
  });

  test('keeps plain seat order when I am not seated', () => {
    expect(clockwiseFrom([5, 0, 2], null)).toEqual([0, 2, 5]);
  });
});

describe('ellipsePositions', () => {
  test('puts the first slot at the bottom centre', () => {
    const [first] = ellipsePositions(4, circle);
    expect(first?.x).toBeCloseTo(50);
    expect(first?.y).toBeCloseTo(90);
  });

  test('goes clockwise on screen: left, then top, then right', () => {
    const [, left, top, right] = ellipsePositions(4, circle);
    expect(left?.x).toBeCloseTo(10);
    expect(left?.y).toBeCloseTo(50);
    expect(top?.x).toBeCloseTo(50);
    expect(top?.y).toBeCloseTo(10);
    expect(right?.x).toBeCloseTo(90);
    expect(right?.y).toBeCloseTo(50);
  });
});

describe('arcPositions', () => {
  test('puts a single opponent at the top centre', () => {
    const [only] = arcPositions(1, circle);
    expect(only?.x).toBeCloseTo(50);
    expect(only?.y).toBeCloseTo(10);
  });

  test('spreads opponents from left to right, mirrored around the centre', () => {
    const [first, second] = arcPositions(2, circle);
    expect(first!.x).toBeLessThan(50);
    expect(second!.x).toBeGreaterThan(50);
    expect(first!.x + second!.x).toBeCloseTo(100);
    expect(first!.y).toBeCloseTo(second!.y);
  });

  test('gives every opponent the same room on a tall screen', () => {
    // On a phone the area is about 1.6 times taller than wide, so 1% of height is more pixels than 1% of width.
    const aspect = 1.6;
    const points = arcPositions(8, circle, aspect);
    const gaps = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, (p.y - points[i]!.y) * aspect));
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.1);
  });

  test('keeps every opponent above the centre line, even with eight', () => {
    const points = arcPositions(8, circle);
    expect(points).toHaveLength(8);
    for (const point of points) {
      expect(point.y).toBeLessThan(50);
    }
  });
});
