import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FAB from '@/components/ui/FAB';

describe('FAB', () => {
  it('uses the teal filled-control foreground and preserves interaction semantics', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText } = render(
      <FAB label="Add game" onPress={onPress} />,
    );

    const button = getByLabelText('Add game');
    expect(button.props.accessibilityRole).toBe('button');
    expect(getByText('Add game').props.className).toContain(
      'text-on-brand-teal',
    );

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
