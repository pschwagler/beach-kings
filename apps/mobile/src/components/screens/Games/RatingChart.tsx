/** Interactive, accessible rating-history chart. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Polygon,
  Polyline,
  Stop,
} from 'react-native-svg';
import AppText from '@/components/ui/AppText';
import { usePaletteColors } from '@/theme/usePaletteColors';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 88;
const PADDING_X = 10;
const PADDING_Y = 10;

interface DataPoint {
  readonly date: string;
  readonly rating: number;
}

interface ChartProps {
  readonly timeline: readonly DataPoint[];
}

interface PlotPoint extends DataPoint {
  readonly x: number;
  readonly y: number;
}

export function nearestRatingPointIndex(
  locationX: number,
  renderedWidth: number,
  pointCount: number,
): number {
  if (pointCount <= 1 || renderedWidth <= 0) return 0;
  const scale = renderedWidth / CHART_WIDTH;
  const plotStart = PADDING_X * scale;
  const plotWidth = (CHART_WIDTH - PADDING_X * 2) * scale;
  const progress = Math.max(0, Math.min(1, (locationX - plotStart) / plotWidth));
  return Math.round(progress * (pointCount - 1));
}

function buildPlotPoints(data: readonly DataPoint[]): PlotPoint[] {
  if (data.length === 0) return [];
  const ratings = data.map((point) => point.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const range = maxRating - minRating;
  const plotWidth = CHART_WIDTH - PADDING_X * 2;
  const plotHeight = CHART_HEIGHT - PADDING_Y * 2;

  return data.map((point, index) => ({
    ...point,
    x:
      data.length === 1
        ? CHART_WIDTH / 2
        : PADDING_X + (index / (data.length - 1)) * plotWidth,
    y:
      range === 0
        ? CHART_HEIGHT / 2
        : PADDING_Y +
          plotHeight -
          ((point.rating - minRating) / range) * plotHeight,
  }));
}

function shortDate(iso: string): string {
  const [yearPart, monthPart, dayPart] = (iso ?? '').split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number.parseInt(dayPart ?? '', 10);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31
  ) {
    return '';
  }
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${monthNames[month - 1]} ${day}`;
}

function longDate(iso: string): string {
  const short = shortDate(iso);
  const year = Number((iso ?? '').split('-')[0]);
  return short.length > 0 && Number.isInteger(year) ? `${short}, ${year}` : 'Date unavailable';
}

function formatRating(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

interface SummaryItemProps {
  readonly label: string;
  readonly rating: number;
  readonly date?: string;
}

function SummaryItem({ label, rating, date }: SummaryItemProps): React.ReactNode {
  return (
    <View
      className="w-1/2 py-xs pr-sm"
      accessibilityLabel={`${label}, rating ${formatRating(rating)}${
        date != null && date.length > 0 ? `, ${date}` : ''
      }`}
    >
      <AppText className="text-caption text-muted">{label}</AppText>
      <AppText className="text-footnote font-bold text-default">
        {formatRating(rating)}
      </AppText>
      {date != null && date.length > 0 ? (
        <AppText className="text-caption text-tertiary">{date}</AppText>
      ) : null}
    </View>
  );
}

export default function RatingChart({ timeline }: ChartProps): React.ReactNode {
  const palette = usePaletteColors();
  const [renderedWidth, setRenderedWidth] = useState(CHART_WIDTH);
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, timeline.length - 1),
  );
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const plotPoints = useMemo(() => buildPlotPoints(timeline), [timeline]);

  const firstDate = timeline[0]?.date;
  const lastDate = timeline[timeline.length - 1]?.date;
  useEffect(() => {
    setSelectedIndex(Math.max(0, timeline.length - 1));
  }, [timeline.length, firstDate, lastDate]);

  if (timeline.length === 0) {
    return (
      <View testID="rating-chart" className="bg-surface rounded-card p-lg border border-divider mb-lg">
        <AppText className="text-footnote font-bold text-default mb-sm">
          Rating History
        </AppText>
        <AppText className="text-caption text-muted">
          Play more games to see your rating trend.
        </AppText>
      </View>
    );
  }

  if (timeline.length === 1) {
    const onlyPoint = timeline[0];
    return (
      <View testID="rating-chart" className="bg-surface rounded-card p-lg border border-divider mb-lg">
        <AppText className="text-footnote font-bold text-default mb-sm">
          Rating History
        </AppText>
        <AppText testID="rating-chart-single" className="text-body font-bold text-default">
          {formatRating(onlyPoint.rating)}
        </AppText>
        <AppText className="text-caption text-muted mt-xs">
          One rating recorded on {longDate(onlyPoint.date)}. Play another rated game to see your trend.
        </AppText>
      </View>
    );
  }

  const points = plotPoints
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const fillPoints = `${PADDING_X},${CHART_HEIGHT - PADDING_Y + 4} ${points} ${
    CHART_WIDTH - PADDING_X
  },${CHART_HEIGHT - PADDING_Y + 4}`;
  const selectedPoint = plotPoints[Math.min(selectedIndex, plotPoints.length - 1)];
  const firstPoint = timeline[0];
  const latestPoint = timeline[timeline.length - 1];
  const minPoint = timeline.reduce((lowest, point) =>
    point.rating < lowest.rating ? point : lowest,
  );
  const maxPoint = timeline.reduce((highest, point) =>
    point.rating > highest.rating ? point : highest,
  );
  const delta = latestPoint.rating - firstPoint.rating;
  const deltaLabel = `${delta >= 0 ? '+' : ''}${Math.round(delta)}`;
  const selectedText = `${longDate(selectedPoint.date)} · ${formatRating(
    selectedPoint.rating,
  )}`;

  const selectNearest = (locationX: number): void => {
    setSelectedIndex(
      nearestRatingPointIndex(locationX, renderedWidth, timeline.length),
    );
  };
  const handleLayout = (event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setRenderedWidth(width);
  };

  return (
    <View testID="rating-chart" className="bg-surface rounded-card p-lg border border-divider mb-lg">
      <View className="flex-row justify-between items-baseline mb-sm">
        <AppText className="text-footnote font-bold text-default">
          Rating History
        </AppText>
        <AppText className={`text-caption font-bold ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
          {deltaLabel}
        </AppText>
      </View>

      <View
        testID="rating-chart-selection"
        accessibilityLiveRegion="polite"
        className="self-start rounded-chip bg-info-tint px-sm py-xs mb-xs"
      >
        <AppText className="text-footnote font-bold text-brand-teal">
          {selectedText}
        </AppText>
      </View>

      <Pressable
        testID="rating-chart-interaction"
        onLayout={handleLayout}
        onPressIn={(event) => {
          touchStartRef.current = {
            x: event.nativeEvent.locationX,
            y: event.nativeEvent.locationY,
          };
        }}
        onPress={(event) => selectNearest(event.nativeEvent.locationX)}
        onPressOut={() => {
          touchStartRef.current = null;
        }}
        onTouchMove={(event) => {
          const start = touchStartRef.current;
          if (start == null) return;
          const deltaX = event.nativeEvent.locationX - start.x;
          const deltaY = event.nativeEvent.locationY - start.y;
          if (Math.abs(deltaX) >= Math.abs(deltaY)) {
            selectNearest(event.nativeEvent.locationX);
          }
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Rating history point"
        accessibilityHint="Swipe up or down to move between rating points"
        accessibilityValue={{
          text: `${longDate(selectedPoint.date)}, rating ${formatRating(
            selectedPoint.rating,
          )}, point ${selectedIndex + 1} of ${timeline.length}`,
        }}
        accessibilityActions={[
          { name: 'increment', label: 'Next rating point' },
          { name: 'decrement', label: 'Previous rating point' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') {
            setSelectedIndex((current) => Math.min(timeline.length - 1, current + 1));
          } else if (event.nativeEvent.actionName === 'decrement') {
            setSelectedIndex((current) => Math.max(0, current - 1));
          }
        }}
      >
        <Svg
          width="100%"
          height={CHART_HEIGHT}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          accessible={false}
        >
          <Defs>
            <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={palette.brandTeal} stopOpacity="0.15" />
              <Stop offset="100%" stopColor={palette.brandTeal} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Polygon points={fillPoints} fill="url(#chartGradient)" />
          <Polyline
            points={points}
            fill="none"
            stroke={palette.brandTeal}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Line
            x1={selectedPoint.x}
            x2={selectedPoint.x}
            y1={PADDING_Y}
            y2={CHART_HEIGHT - PADDING_Y}
            stroke={palette.textMuted}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <Circle
            cx={selectedPoint.x}
            cy={selectedPoint.y}
            r={5}
            fill={palette.bgSurface}
            stroke={palette.brandTeal}
            strokeWidth={3}
          />
        </Svg>
      </Pressable>

      <View className="flex-row justify-between mt-xs">
        <AppText className="text-caption text-muted">{shortDate(firstPoint.date)}</AppText>
        <AppText className="text-caption text-muted">{shortDate(latestPoint.date)}</AppText>
      </View>

      <View testID="rating-chart-summary" className="flex-row flex-wrap mt-sm pt-sm border-t border-divider">
        <SummaryItem label="Start" rating={firstPoint.rating} date={shortDate(firstPoint.date)} />
        <SummaryItem label="Latest" rating={latestPoint.rating} date={shortDate(latestPoint.date)} />
        <SummaryItem label="Low" rating={minPoint.rating} />
        <SummaryItem label="High" rating={maxPoint.rating} />
      </View>
    </View>
  );
}
