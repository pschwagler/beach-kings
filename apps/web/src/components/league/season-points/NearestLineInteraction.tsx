'use client';
import { useEffect, useMemo, useRef } from 'react';
import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import { nearestSeries } from './nearest-series';

/** Hit-test the SVG itself so rendered dots cannot intercept line interaction. */
export default function NearestLineInteraction({ data, ids, preferredId, onHover, onSelect }: {
  data: Record<string, number>[]; ids: string[]; preferredId: string | null;
  onHover: (id: string | null) => void; onSelect: (id: string) => void;
}) {
  const target = useRef<SVGRectElement>(null);
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const series = useMemo(() => !xScale || !yScale ? [] : ids.map(id => ({
    id, points: data.map(row => {
      if (row[id] == null) return null;
      const x = xScale(row.x), y = yScale(row[id]);
      return x == null || y == null ? null : { x, y };
    }),
  })), [data, ids, xScale, yScale]);
  useEffect(() => {
    const svg = target.current?.ownerSVGElement;
    if (!svg || !plot) return;
    function closest(event: PointerEvent | MouseEvent) {
      const matrix = svg!.getScreenCTM();
      if (!matrix) return null;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      if (point.x < plot!.x || point.x > plot!.x + plot!.width || point.y < plot!.y || point.y > plot!.y + plot!.height) return null;
      return nearestSeries(point, series, preferredId);
    }
    function move(event: PointerEvent) { onHover(closest(event)); }
    function select(event: MouseEvent) { const id = closest(event); if (id) { onHover(id); onSelect(id); } }
    svg.addEventListener('pointermove', move, true);
    svg.addEventListener('click', select, true);
    return () => {
      svg.removeEventListener('pointermove', move, true);
      svg.removeEventListener('click', select, true);
    };
  }, [plot, series, preferredId, onHover, onSelect]);
  if (!plot) return null;
  return <rect ref={target} data-testid="nearest-line-target" x={plot.x} y={plot.y} width={plot.width} height={plot.height}
    fill="transparent" pointerEvents="none" aria-hidden="true"/>;
}
