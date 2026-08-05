import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockImportCredentialPair = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ devLoginWithTokens: mockImportCredentialPair }),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textTertiary: '#697577' }),
}));

import DevLoginPanel from '@/components/dev/DevLoginPanel';

describe('DevLoginPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockImportCredentialPair.mockResolvedValue(undefined);
  });

  it('passes the pasted pair through the canonical auth extension', async () => {
    const { getByTestId } = render(<DevLoginPanel onSelect={jest.fn()} />);

    fireEvent.changeText(getByTestId('dev-access-token'), 'qa-access');
    fireEvent.changeText(getByTestId('dev-refresh-token'), 'qa-refresh');
    fireEvent.press(getByTestId('dev-import-tokens'));

    await waitFor(() => {
      expect(mockImportCredentialPair).toHaveBeenCalledWith({
        accessToken: 'qa-access',
        refreshToken: 'qa-refresh',
      });
    });
  });
});
