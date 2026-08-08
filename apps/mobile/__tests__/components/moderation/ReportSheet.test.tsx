import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ReportSheet from '@/components/moderation/ReportSheet';

const mockMutateAsync = jest.fn();

jest.mock('@/features/moderation', () => ({
  useModerationMutations: () => ({
    report: { mutateAsync: mockMutateAsync, isPending: false },
  }),
}));
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textMuted: '#777', textDefault: '#111' }),
}));

describe('ReportSheet urgent report reasons', () => {
  beforeEach(() => mockMutateAsync.mockReset().mockResolvedValue({}));

  it.each([
    ['Stalking or doxxing', 'stalking_doxxing'],
    ['Sexual exploitation', 'sexual_exploitation'],
  ])('submits %s with the stable wire value', async (label, wireValue) => {
    const onClose = jest.fn();
    const screen = render(
      <ReportSheet targetType="player" targetId={42} onClose={onClose} />,
    );

    fireEvent.press(screen.getByText(label));
    fireEvent.press(screen.getByText('Submit report'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      target_type: 'player',
      target_id: 42,
      reason: wireValue,
    }));
    expect(onClose).toHaveBeenCalled();
  });
});
