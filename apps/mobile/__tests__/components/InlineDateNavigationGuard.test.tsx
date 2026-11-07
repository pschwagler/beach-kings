import React from 'react';
import { render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import InlineDateNavigationGuard from '@/components/screens/Sessions/InlineDateNavigationGuard';

const mockChildOptions = jest.fn();
const mockParentOptions = jest.fn();
const mockNavigation = { setOptions: mockChildOptions, getParent: () => ({ setOptions: mockParentOptions }) };
jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
}));

it('owns native child/root gestures and hardware Back only while focused', () => {
  const remove = jest.fn();
  let back!: () => boolean;
  const listener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, callback) => {
    back = callback as () => boolean;
    return { remove };
  });
  const dismiss = jest.fn();
  const ui = render(<InlineDateNavigationGuard onDismiss={dismiss} />);
  expect(mockChildOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  expect(mockParentOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  expect(back()).toBe(true);
  expect(dismiss).toHaveBeenCalledTimes(1);
  ui.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(mockChildOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  expect(mockParentOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  listener.mockRestore();
});
