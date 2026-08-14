import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#1a3a4a',
    onBrandTeal: '#fffdf8',
    textMuted: '#596568',
  }),
}));

import SegmentControl from '@/components/ui/SegmentControl';
import TabView from '@/components/ui/TabView';
import FilterChipBar from '@/components/ui/FilterChipBar';
import { centeredHorizontalOffset } from '@/components/ui/useHorizontalOverflow';

const VIEW_ITEMS = [
  { value: 'list', label: 'List', testID: 'view-list' },
  { value: 'map', label: 'Map', badge: 3, testID: 'view-map' },
] as const;

describe('keyed navigation controls', () => {
  it('centers selected items while clamping to both scroll edges', () => {
    expect(centeredHorizontalOffset(600, 200, 250, 100)).toBe(200);
    expect(centeredHorizontalOffset(600, 200, 10, 80)).toBe(0);
    expect(centeredHorizontalOffset(600, 200, 550, 50)).toBe(400);
  });

  it('selects a SegmentControl item by stable value and exposes position', () => {
    const onValueChange = jest.fn();
    render(
      <SegmentControl
        items={VIEW_ITEMS}
        value="list"
        onValueChange={onValueChange}
        testID="view-control"
      />,
    );

    expect(screen.getByTestId('view-control')).toHaveProp('accessibilityRole', 'tablist');
    expect(screen.getByTestId('view-list')).toHaveAccessibilityState({ selected: true });
    expect(screen.getByTestId('view-map')).toHaveAccessibilityValue({ text: '2 of 2' });
    expect(screen.getByTestId('view-map')).toHaveProp('accessibilityLabel', 'Map, 3');

    fireEvent.press(screen.getByTestId('view-map'));
    expect(onValueChange).toHaveBeenCalledWith('map');
    expect(screen.getByText('List')).not.toHaveProp('adjustsFontSizeToFit', true);
  });

  it('renders TabView badges, test IDs, and disabled state from keyed items', () => {
    const onValueChange = jest.fn();
    const items = [
      { value: 'games', label: 'Games', badge: 2 },
      { value: 'chat', label: 'Chat', disabled: true },
    ] as const;

    render(
      <TabView
        items={items}
        value="games"
        onValueChange={onValueChange}
        tabTestIDPrefix="league-tab"
      />,
    );

    expect(screen.getByTestId('league-tab-games')).toHaveAccessibilityState({
      selected: true,
    });
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByTestId('league-tab-chat')).toHaveAccessibilityState({
      disabled: true,
    });

    fireEvent.press(screen.getByTestId('league-tab-chat'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('exposes browse filters as selected 44-point buttons', () => {
    const onValueChange = jest.fn();
    render(
      <FilterChipBar
        items={VIEW_ITEMS}
        value="map"
        onValueChange={onValueChange}
        testID="court-filters"
        chipTestIDPrefix="court-filter"
      />,
    );

    expect(screen.getByTestId('court-filters')).toHaveProp('accessibilityRole', 'toolbar');
    expect(screen.getByTestId('court-filters')).toHaveProp('accessibilityLabel', 'Filters');
    expect(screen.getByTestId('view-map')).toHaveAccessibilityState({ selected: true });
    expect(screen.getByTestId('view-map')).toHaveAccessibilityValue({ text: '2 of 2' });
    expect(screen.getByTestId('view-map')).toHaveProp(
      'className',
      expect.stringContaining('min-h-touch'),
    );

    fireEvent.press(screen.getByTestId('view-list'));
    expect(onValueChange).toHaveBeenCalledWith('list');
  });

  it('shows directional, focus-safe cues when filters overflow', () => {
    render(
      <FilterChipBar
        items={VIEW_ITEMS}
        value="list"
        onValueChange={jest.fn()}
        testID="overflow-filters"
      />,
    );

    const filters = screen.getByTestId('overflow-filters');
    fireEvent(filters, 'layout', {
      nativeEvent: { layout: { height: 44, width: 160, x: 0, y: 0 } },
    });
    fireEvent(filters, 'contentSizeChange', 320, 44);

    expect(screen.getByTestId('horizontal-overflow-forward', { includeHiddenElements: true })).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(filters).toHaveProp('accessibilityHint', 'Swipe left or right to see more filters');

    fireEvent.scroll(filters, {
      nativeEvent: { contentOffset: { x: 160, y: 0 } },
    });

    expect(screen.getByTestId('horizontal-overflow-backward', {
      includeHiddenElements: true,
    })).toBeTruthy();
    expect(screen.queryByTestId('horizontal-overflow-forward', {
      includeHiddenElements: true,
    })).toBeNull();
  });
});
