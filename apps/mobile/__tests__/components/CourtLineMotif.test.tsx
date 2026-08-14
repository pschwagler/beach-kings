import React from 'react';
import { render } from '@testing-library/react-native';
import CourtLineMotif from '@/components/brand/CourtLineMotif';

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    textInverse: '#fffdf8',
    brandTeal: '#155b65',
    brandGold: '#e0b44c',
  }),
}));

describe('CourtLineMotif', () => {
  it.each(['welcome', 'home', 'add-games'] as const)(
    'renders the %s variant outside the accessibility tree',
    (variant) => {
      const { getByTestId } = render(<CourtLineMotif variant={variant} />);
      const motif = getByTestId(`court-line-motif-${variant}`, {
        includeHiddenElements: true,
      });
      expect(motif.props.pointerEvents).toBe('none');
      expect(motif.props.accessible).toBe(false);
      expect(motif.props.importantForAccessibility).toBe('no-hide-descendants');
    },
  );
});
