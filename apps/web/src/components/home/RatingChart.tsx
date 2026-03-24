'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

/**
 * Custom tooltip for the rating chart.
 * Shows date, end-of-day rating, day delta, games played, and max rating.
 */
interface RatingDataPoint {
  date: string;
  rating: number;
  maxRating?: number | null;
  games: number;
  dayDelta?: number | null;
}

interface TooltipPayloadEntry {
  payload: RatingDataPoint;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const { date, rating, maxRating, games, dayDelta } = payload[0].payload as RatingDataPoint;
  return (
    <div className="my-stats-tab__chart-tooltip">
      <div className="my-stats-tab__chart-tooltip-date">{date}</div>
      <div className="my-stats-tab__chart-tooltip-rating">
        {Math.round(rating)}
        {dayDelta != null && dayDelta !== 0 && (
          <span className={`my-stats-tab__chart-tooltip-delta my-stats-tab__chart-tooltip-delta--${dayDelta > 0 ? 'up' : 'down'}`}>
            {dayDelta > 0 ? '+' : ''}{Math.round(dayDelta)}
          </span>
        )}
      </div>
      <div className="my-stats-tab__chart-tooltip-meta">
        {games} game{games !== 1 ? 's' : ''}
        {maxRating != null && <> &middot; peak {Math.round(maxRating)}</>}
      </div>
    </div>
  );
}

/**
 * Formats a date string for the X-axis label.
 * Shows "MMM 'YY" (e.g., "Jan '24").
 */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/**
 * RatingChart — Recharts LineChart showing ELO rating over time.
 *
 * @param {Array<{date: string, rating: number, maxRating: number, games: number, dayDelta: number|null}>} data
 */
interface RatingChartProps {
  data: RatingDataPoint[];
}

export default function RatingChart({ data }: RatingChartProps) {
  if (!data || data.length < 2) {
    return (
      <div className="my-stats-tab__chart-empty">
        Not enough data to show rating history
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-200)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateLabel}
          tick={{ fontSize: 12, fill: 'var(--gray-600)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--gray-200)' }}
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fontSize: 12, fill: 'var(--gray-600)' }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="rating"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, fill: 'var(--primary)', stroke: 'white', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
