import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { items: [] },
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));

jest.mock('@/features/sessions', () => ({
  sessionQueries: {
    playerSearch: jest.fn(() => ({ queryKey: ['players'] })),
  },
  useSessionPlayerMutations: () => ({
    invitePlayer: {
      isPending: false,
      variables: undefined,
      mutate: jest.fn(),
    },
  }),
}));

jest.mock('@/hooks/useDebounce', () => ({
  __esModule: true,
  default: (value: string) => value,
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: 'teal',
    textTertiary: 'gray',
  }),
}));

jest.mock('@/components/ui/TopNav', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ui/Avatar', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

import SessionAddPlayerModal from '@/components/screens/Sessions/SessionAddPlayerModal';

describe('SessionAddPlayerModal', () => {
  it('lets player option taps reach the list while the search keyboard is open', () => {
    render(
      <SessionAddPlayerModal
        sessionId={9}
        existingPlayerIds={new Set()}
        onClose={jest.fn()}
        onAdded={jest.fn()}
      />,
    );

    expect(screen.getByTestId('roster-player-options')).toHaveProp(
      'keyboardShouldPersistTaps',
      'always',
    );
  });
});
