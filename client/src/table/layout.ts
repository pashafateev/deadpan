// Where seats go on screen. Positions are percentages of the table area, with y
// growing downwards, so increasing angles run clockwise on screen.

export interface Point {
  x: number;
  y: number;
}

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Orders seats clockwise starting from mine, so I can always sit at the bottom. */
export function clockwiseFrom(seats: number[], mySeat: number | null): number[] {
  const sorted = [...seats].sort((a, b) => a - b);
  if (mySeat === null) return sorted;
  return [...sorted.filter((s) => s >= mySeat), ...sorted.filter((s) => s < mySeat)];
}

function pointAt(degrees: number, { cx, cy, rx, ry }: Ellipse): Point {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + rx * Math.cos(radians), y: cy + ry * Math.sin(radians) };
}

/** Evenly spaced slots around a whole ellipse, starting at the bottom centre. Used on desktop. */
export function ellipsePositions(count: number, shape: Ellipse): Point[] {
  return Array.from({ length: count }, (_, i) => pointAt(90 + (i * 360) / count, shape));
}

const ARC_SAMPLES = 360;

/**
 * Opponents spread over the top half of an ellipse, left to right. Used on an
 * upright phone, where I sit below the arc and the board sits in the middle.
 * `aspect` is the area's height over its width; spacing is even in on-screen
 * distance rather than in angle, so seats don't bunch up at the top.
 */
export function arcPositions(count: number, shape: Ellipse, aspect = 1): Point[] {
  const angles = Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => 180 + (i * 180) / ARC_SAMPLES);
  const lengths = [0];
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const a = pointAt(angles[i - 1]!, shape);
    const b = pointAt(angles[i]!, shape);
    lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, (b.y - a.y) * aspect));
  }
  const total = lengths[ARC_SAMPLES]!;
  return Array.from({ length: count }, (_, k) => {
    const target = ((k + 0.5) / count) * total;
    const i = Math.max(1, lengths.findIndex((length) => length >= target));
    const t = (target - lengths[i - 1]!) / (lengths[i]! - lengths[i - 1]!);
    return pointAt(angles[i - 1]! + t * (angles[i]! - angles[i - 1]!), shape);
  });
}
