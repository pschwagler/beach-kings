import React from 'react';
import { render } from '@testing-library/react-native';
import AppText from '@/components/ui/AppText';

describe('AppText', () => {
  it('uses Barlow by default and preserves native Text props', () => {
    const { getByText } = render(
      <AppText
        accessibilityLabel="Accessible label"
        selectable
        testID="copy"
      >
        Courtside copy
      </AppText>,
    );

    const text = getByText('Courtside copy');
    expect(text).toHaveStyle({ fontFamily: 'Barlow' });
    expect(text.props.accessibilityLabel).toBe('Accessible label');
    expect(text.props.selectable).toBe(true);
    expect(text.props.allowFontScaling).not.toBe(false);
  });

  it('maps display variants to Barlow Condensed with the requested weight', () => {
    const { getByText } = render(
      <AppText family="display" variant="title1" weight="semibold">
        League standings
      </AppText>,
    );

    expect(getByText('League standings')).toHaveStyle({
      fontFamily: 'Barlow Condensed',
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '600',
    });
  });

  it('lets an explicit native style override a variant', () => {
    const { getByText } = render(
      <AppText variant="body" style={{ fontSize: 18 }}>
        Override
      </AppText>,
    );

    expect(getByText('Override')).toHaveStyle({ fontSize: 18 });
  });
});
