import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import ChatComposer from '@/components/ui/ChatComposer';

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#117788',
    bgElevated: '#eeeeee',
    textInverse: '#ffffff',
    textTertiary: '#777777',
  }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

describe('ChatComposer', () => {
  it('keeps NativeWind classes stable when typing enables send', () => {
    const onChangeText = jest.fn();
    const onSend = jest.fn();
    const view = render(
      <ChatComposer
        value=""
        onChangeText={onChangeText}
        onSend={onSend}
      />,
    );

    const disabledSurface = view.getByTestId('chat-composer-send-surface');
    const stableClassName = disabledSurface.props.className;
    expect(StyleSheet.flatten(disabledSurface.props.style)).toMatchObject({
      backgroundColor: '#eeeeee',
    });

    view.rerender(
      <ChatComposer
        value="Hello"
        onChangeText={onChangeText}
        onSend={onSend}
      />,
    );

    const enabledSurface = view.getByTestId('chat-composer-send-surface');
    expect(enabledSurface.props.className).toBe(stableClassName);
    expect(StyleSheet.flatten(enabledSurface.props.style)).toMatchObject({
      backgroundColor: '#117788',
    });
    expect(view.getByTestId('chat-composer-send').props.accessibilityState)
      .toEqual({ disabled: false, busy: false });
  });
});
