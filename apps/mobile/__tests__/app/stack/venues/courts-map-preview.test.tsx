/**
 * Tests for CourtsMapPreview — the real (non-placeholder) list-header map.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  const MockMapView = ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
    <View testID={testID ?? 'map-view'}>{children}</View>
  );
  const MockMarker = ({ title }: { title?: string }) => (
    <Pressable accessibilityLabel={title ?? 'marker'}>
      <Text>{title}</Text>
    </Pressable>
  );
  return { __esModule: true, default: MockMapView, Marker: MockMarker };
});

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ brandTeal: '#00b4a2' }),
}));

import CourtsMapPreview from '@/components/screens/Venues/CourtsMapPreview';

const COURT = {
  id: 1,
  name: 'Manhattan Beach Courts',
  city: 'Manhattan Beach',
  state: 'CA',
  latitude: 33.88,
  longitude: -118.41,
} as never;

describe('CourtsMapPreview', () => {
  it('renders the map container and a marker for a court with coords', () => {
    render(
      <CourtsMapPreview courts={[COURT]} userLocation={null} onViewFullMap={jest.fn()} />,
    );
    expect(screen.getByTestId('courts-map-stub')).toBeTruthy();
    expect(screen.getByText('Manhattan Beach Courts')).toBeTruthy();
  });

  it('invokes onViewFullMap when the button is pressed', () => {
    const onViewFullMap = jest.fn();
    render(
      <CourtsMapPreview courts={[COURT]} userLocation={null} onViewFullMap={onViewFullMap} />,
    );
    fireEvent.press(screen.getByTestId('courts-view-full-map-btn'));
    expect(onViewFullMap).toHaveBeenCalledTimes(1);
  });

  it('shows the "Map view" fallback when there is nothing to map', () => {
    render(
      <CourtsMapPreview courts={[]} userLocation={null} onViewFullMap={jest.fn()} />,
    );
    expect(screen.getByText('Map view')).toBeTruthy();
    // Still offers the full-map affordance.
    expect(screen.getByTestId('courts-view-full-map-btn')).toBeTruthy();
  });
});
