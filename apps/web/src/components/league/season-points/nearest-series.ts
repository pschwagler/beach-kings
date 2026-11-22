export type Point = { x: number; y: number };
export type ChartSeries = { id: string; points: (Point | null)[] };

function squaredDistanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / length));
  return (point.x - start.x - t * dx) ** 2 + (point.y - start.y - t * dy) ** 2;
}

/** Hit-test the rendered lines in screen coordinates, including dots and gaps. */
export function nearestSeries(point: Point, series: ChartSeries[], preferredId: string | null = null): string | null {
  let nearest: string | null = null;
  let best = Infinity;
  let preferredDistance = Infinity;
  for (const line of series) {
    let distance = Infinity;
    let previous: Point | null = null;
    for (const current of line.points) {
      if (!current || !Number.isFinite(current.x) || !Number.isFinite(current.y)) {
        previous = null;
        continue;
      }
      distance = Math.min(distance, squaredDistanceToSegment(point, previous ?? current, current));
      previous = current;
    }
    if (distance < best) { best = distance; nearest = line.id; }
    if (line.id === preferredId) preferredDistance = distance;
  }
  // Preserve the current line at coincident points and very close crossings.
  if (nearest && preferredId && Math.sqrt(preferredDistance) <= Math.sqrt(best) + 0.5) return preferredId;
  return nearest;
}
