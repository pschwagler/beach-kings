/**
 * RatingChart — simplified rating history sparkline.
 *
 * Matches the `.chart-card` section in my-stats.html.
 * Renders a static SVG polyline path from the elo_timeline data.
 * No interactive tooltips for V1 — just a visual trend indicator.
 */

import React, { useMemo } from 'react';
import AppText from '@/components/ui/AppText';
import { View } from 'react-native';
import Svg, { Polyline, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
  // Expects an ISO date ("YYYY-MM-DD", optionally with a time suffix). Guard
  // against empty/malformed values so the axis never renders "undefined NaN".
  const parts = (iso ?? '').split('-');
  if (parts.length < 3) return '';
  const month = Number(parts[1]);
  const day = parseInt(parts[2], 10);
  if (!Number.isInteger(month) || month < 1 || month > 12 || Number.isNaN(day)) {
    return '';
  }
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month - 1]} ${day}`;
}

export default function RatingChart({ timeline }: ChartProps): React.ReactNode {
  const palette = usePaletteColors();
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
        className="bg-surface rounded-[12px] p-4 border border-divider mb-4"
      >
        <AppText className="text-[13px] font-bold text-default mb-2">
          Rating History
        </AppText>
        <AppText className="text-[12px] text-muted">
          Play more games to see your rating trend.
        </AppText>
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
      className="bg-surface rounded-[12px] p-4 border border-divider mb-4"
    >
      {/* Header */}
      <View className="flex-row justify-between items-baseline mb-3">
        <AppText className="text-[13px] font-bold text-default">
          Rating History
        </AppText>
        <AppText
          className={`text-[11px] font-bold ${
            deltaUp
              ? 'text-success'
              : 'text-danger'
          }`}
        >
          {deltaLabel}
        </AppText>
      </View>

      {/* Chart */}
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <Defs>
          <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={palette.brandTeal} stopOpacity="0.15" />
            <Stop offset="100%" stopColor={palette.brandTeal} stopOpacity="0" />
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
          stroke={palette.brandTeal}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {/* Date labels */}
      <View className="flex-row justify-between mt-1">
        <AppText className="text-[10px] text-muted">
          {firstLabel}
        </AppText>
        <AppText className="text-[10px] text-muted">
          {lastLabel}
        </AppText>
      </View>
    </View>
  );
}
