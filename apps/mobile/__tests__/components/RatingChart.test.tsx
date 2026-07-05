/**
 * Tests for RatingChart date-axis labels — guards against the "undefined NaN"
 * regression when a timeline point carries an empty/malformed date.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';

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
    Defs: Passthrough,
    LinearGradient: Passthrough,
    Stop: () => null,
  };
});

import RatingChart from '@/components/screens/Games/RatingChart';

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
    expect(screen.getByText('Jun 1')).toBeTruthy();
    expect(screen.getByText('Jul 5')).toBeTruthy();
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
