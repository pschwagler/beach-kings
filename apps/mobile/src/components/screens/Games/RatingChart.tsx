/**
 * RatingChart — simplified rating history sparkline.
 *
 * Matches the `.chart-card` section in my-stats.html.
 * Renders a static SVG polyline path from the elo_timeline data.
 * No interactive tooltips for V1 — just a visual trend indicator.
 */

import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, { Polyline, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 70;
const PADDING_X = 8;
const PADDING_Y = 8;

interface DataPoint {
  readonly date: string;
  readonly rating: number;
}

interface ChartProps {
  readonly timeline: readonly DataPoint[];
}

function buildPolylinePoints(
  data: readonly DataPoint[],
  width: number,
  height: number,
): string {
  if (data.length < 2) return '';

  const ratings = data.map((d) => d.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const range = maxRating - minRating || 1;

  const plotWidth = width - PADDING_X * 2;
  const plotHeight = height - PADDING_Y * 2;

  return data
    .map((d, i) => {
      const x = PADDING_X + (i / (data.length - 1)) * plotWidth;
      const y = PADDING_Y + plotHeight - ((d.rating - minRating) / range) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function buildFillPoints(
  data: readonly DataPoint[],
  width: number,
  height: number,
): string {
  if (data.length < 2) return '';
  const line = buildPolylinePoints(data, width, height);
  const lastX = (PADDING_X + (width - PADDING_X * 2)).toFixed(1);
  const firstX = PADDING_X.toFixed(1);
  const bottomY = (height - PADDING_Y + 4).toFixed(1);
  return `${firstX},${bottomY} ${line} ${lastX},${bottomY}`;
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[Number(month) - 1]} ${Number(day)}`;
}

export default function RatingChart({ timeline }: ChartProps): React.ReactNode {
  const points = useMemo(
    () => buildPolylinePoints(timeline, CHART_WIDTH, CHART_HEIGHT),
    [timeline],
  );
  const fillPoints = useMemo(
    () => buildFillPoints(timeline, CHART_WIDTH, CHART_HEIGHT),
    [timeline],
  );

  if (timeline.length < 2) {
    return (
      <View
        testID="rating-chart"
        className="bg-white dark:bg-dark-surface rounded-[12px] p-4 shadow-sm dark:shadow-none dark:border dark:border-border-subtle mb-4"
      >
        <Text className="text-[13px] font-bold text-text-default dark:text-content-primary mb-2">
          Rating History
        </Text>
        <Text className="text-[12px] text-text-muted dark:text-content-tertiary">
          Play more games to see your rating trend.
        </Text>
      </View>
    );
  }

  const firstLabel = shortDate(timeline[0].date);
  const lastLabel = shortDate(timeline[timeline.length - 1].date);
  const latestRating = timeline[timeline.length - 1].rating;
  const firstRating = timeline[0].rating;
  const delta = latestRating - firstRating;
  const deltaLabel = `${delta >= 0 ? '+' : ''}${delta}`;
  const deltaUp = delta >= 0;

  return (
    <View
      testID="rating-chart"
      className="bg-white dark:bg-dark-surface rounded-[12px] p-4 shadow-sm dark:shadow-none dark:border dark:border-border-subtle mb-4"
    >
      {/* Header */}
      <View className="flex-row justify-between items-baseline mb-3">
        <Text className="text-[13px] font-bold text-text-default dark:text-content-primary">
          Rating History
        </Text>
        <Text
          className={`text-[11px] font-bold ${
            deltaUp
              ? 'text-green-700 dark:text-green-400'
              : 'text-red-700 dark:text-red-400'
          }`}
        >
          {deltaLabel}
        </Text>
      </View>

      {/* Chart */}
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <Defs>
          <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#2a7d9c" stopOpacity="0.15" />
            <Stop offset="100%" stopColor="#2a7d9c" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {/* Fill area */}
        {fillPoints.length > 0 && (
          <Polygon
            points={fillPoints}
            fill="url(#chartGradient)"
          />
        )}
        {/* Line */}
        <Polyline
          points={points}
          fill="none"
          stroke="#2a7d9c"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {/* Date labels */}
      <View className="flex-row justify-between mt-1">
        <Text className="text-[10px] text-text-muted dark:text-content-tertiary">
          {firstLabel}
        </Text>
        <Text className="text-[10px] text-text-muted dark:text-content-tertiary">
          {lastLabel}
        </Text>
      </View>
    </View>
  );
}
