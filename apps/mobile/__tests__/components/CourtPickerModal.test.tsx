import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import CourtPickerModal from '@/components/ui/CourtPickerModal';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textTertiary: 'gray', brandTeal: 'teal' }),
}));

describe('CourtPickerModal', () => {
  const courts = [
    { id: 1, name: 'Ocean Beach' },
    { id: 2, name: 'Mission Bay' },
  ];

  it('filters courts by name', () => {
    render(
      <CourtPickerModal
        visible
        courts={courts}
        onSelect={jest.fn()}
        onClose={jest.fn()}
        testIDPrefix="test-court"
      />,
    );

    fireEvent.changeText(screen.getByTestId('test-court-search'), 'mission');

    expect(screen.getByTestId('test-court-option-2')).toBeTruthy();
    expect(screen.queryByTestId('test-court-option-1')).toBeNull();
  });

  it('supports clearing an optional selection and closes after selection', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    render(
      <CourtPickerModal
        visible
        courts={courts}
        selectedCourtId={1}
        onSelect={onSelect}
        onClose={onClose}
        allowNone
        testIDPrefix="test-court"
      />,
    );

    fireEvent.press(screen.getByTestId('test-court-option-none'));

    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
