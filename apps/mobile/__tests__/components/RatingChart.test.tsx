/**
 * Tests for RatingChart date-axis labels — guards against the "undefined NaN"
 * regression when a timeline point carries an empty/malformed date.
 */
import React from 'react';
import {
  render as renderTestingLibrary,
  screen,
  fireEvent,
} from '@testing-library/react-native';
import ThemeProvider from '@/contexts/ThemeContext';

jest.mock('nativewind', () => ({
  useColorScheme: () => ({
    colorScheme: 'light',
    setColorScheme: jest.fn(),
  }),
  vars: (values: object) => values,
}));

function render(ui: React.ReactElement) {
  return renderTestingLibrary(<ThemeProvider>{ui}</ThemeProvider>);
}

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  return {
    __esModule: true,
    default: Passthrough,
    Svg: Passthrough,
    Polyline: () => null,
    Polygon: () => null,
    Line: () => null,
    Circle: () => null,
    Defs: Passthrough,
    LinearGradient: Passthrough,
    Stop: () => null,
  };
});

import RatingChart, {
  nearestRatingPointIndex,
} from '@/components/screens/Games/RatingChart';

const TIMELINE = [
  { date: '2026-06-01', rating: 1000 },
  { date: '2026-06-15', rating: 980 },
  { date: '2026-06-28', rating: 1060 },
  { date: '2026-07-05', rating: 1040 },
];

describe('RatingChart date labels', () => {
  it('renders formatted month/day labels for valid ISO dates', () => {
    render(
      <RatingChart
        timeline={[
          { date: '2026-06-01', rating: 1000 },
          { date: '2026-07-05', rating: 1040 },
        ]}
      />,
    );
    expect(screen.getAllByText('Jun 1')).toHaveLength(2);
    expect(screen.getAllByText('Jul 5')).toHaveLength(2);
  });

  it('never renders "undefined NaN" when a date is empty or malformed', () => {
    render(
      <RatingChart
        timeline={[
          { date: '', rating: 1000 },
          { date: 'not-a-date', rating: 1040 },
        ]}
      />,
    );
    expect(screen.queryByText(/undefined|NaN/)).toBeNull();
  });
});

describe('RatingChart point interaction', () => {
  it('maps rendered x coordinates to the nearest point with clamping', () => {
    expect(nearestRatingPointIndex(-20, 320, 4)).toBe(0);
    expect(nearestRatingPointIndex(110, 320, 4)).toBe(1);
    expect(nearestRatingPointIndex(220, 320, 4)).toBe(2);
    expect(nearestRatingPointIndex(400, 320, 4)).toBe(3);
    expect(nearestRatingPointIndex(160, 640, 4)).toBe(1);
  });

  it('starts at latest and exposes start/latest/low/high text', () => {
    render(<RatingChart timeline={TIMELINE} />);

    expect(screen.getByText('Jul 5, 2026 · 1,040')).toBeTruthy();
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Latest')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByLabelText('Rating history point')).toHaveAccessibilityValue({
      text: 'Jul 5, 2026, rating 1,040, point 4 of 4',
    });
  });

  it('selects the nearest point on tap and drag', () => {
    render(<RatingChart timeline={TIMELINE} />);
    const interaction = screen.getByTestId('rating-chart-interaction');

    fireEvent(interaction, 'layout', {
      nativeEvent: { layout: { width: 320, height: 88, x: 0, y: 0 } },
    });
    fireEvent.press(interaction, { nativeEvent: { locationX: 110 } });
    expect(screen.getByText('Jun 15, 2026 · 980')).toBeTruthy();

    fireEvent(interaction, 'pressIn', {
      nativeEvent: { locationX: 110, locationY: 40 },
    });
    fireEvent(interaction, 'touchMove', {
      nativeEvent: { locationX: 220, locationY: 42 },
    });
    expect(screen.getByText('Jun 28, 2026 · 1,060')).toBeTruthy();
  });

  it('does not scrub while the parent page is being scrolled vertically', () => {
    render(<RatingChart timeline={TIMELINE} />);
    const interaction = screen.getByTestId('rating-chart-interaction');
    fireEvent.press(interaction, { nativeEvent: { locationX: 110 } });

    fireEvent(interaction, 'pressIn', {
      nativeEvent: { locationX: 110, locationY: 20 },
    });
    fireEvent(interaction, 'touchMove', {
      nativeEvent: { locationX: 115, locationY: 70 },
    });

    expect(screen.getByText('Jun 15, 2026 · 980')).toBeTruthy();
  });

  it('moves point-by-point through screen-reader adjustment actions', () => {
    render(<RatingChart timeline={TIMELINE} />);
    const interaction = screen.getByTestId('rating-chart-interaction');

    fireEvent(interaction, 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(screen.getByText('Jun 28, 2026 · 1,060')).toBeTruthy();

    fireEvent(interaction, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(screen.getByText('Jul 5, 2026 · 1,040')).toBeTruthy();
  });

  it('keeps empty and single-point histories explicit', () => {
    const { rerender } = render(<RatingChart timeline={[]} />);
    expect(screen.getByText('Play more games to see your rating trend.')).toBeTruthy();

    rerender(
      <ThemeProvider>
        <RatingChart timeline={[TIMELINE[0]]} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('rating-chart-single')).toHaveTextContent('1,000');
    expect(screen.getByText(/One rating recorded on Jun 1, 2026/)).toBeTruthy();
  });
});
