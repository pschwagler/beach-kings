import React from 'react';
import { AccessibilityInfo, Modal as RNModal, Platform, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import BottomSheet from '@/components/ui/BottomSheet';
import Modal from '@/components/ui/Modal';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
    SafeAreaView: React.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode },
        ref: React.Ref<React.ElementRef<typeof View>>,
      ) => (
        <View ref={ref} {...props}>
          {children}
        </View>
      ),
    ),
  };
});

jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

describe('shared modal accessibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks a full-screen modal as modal content and supports escape and back dismissal', () => {
    const onClose = jest.fn();
    const view = render(
      <Modal visible onClose={onClose} title="Edit profile" testID="profile-dialog">
        <View />
      </Modal>,
    );

    const dialog = screen.getByTestId('profile-dialog');
    expect(dialog).toHaveProp('role', 'dialog');
    expect(dialog).toHaveProp('accessibilityLabel', 'Edit profile');
    expect(dialog).toHaveProp('accessibilityViewIsModal', true);

    fireEvent(dialog, 'accessibilityEscape');
    fireEvent(view.UNSAFE_getByType(RNModal), 'requestClose');

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('marks a bottom sheet as modal content and keeps its backdrop out of screen-reader order', () => {
    const onClose = jest.fn();
    const view = render(
      <BottomSheet
        visible
        onClose={onClose}
        testID="actions-sheet"
        accessibilityLabel="Player actions"
      >
        <View />
      </BottomSheet>,
    );

    const sheet = screen.getByTestId('actions-sheet');
    expect(sheet).toHaveProp('role', 'dialog');
    expect(sheet).toHaveProp('accessibilityLabel', 'Player actions');
    expect(sheet).toHaveProp('accessibilityViewIsModal', true);
    expect(
      screen.getByTestId('actions-sheet-backdrop', {
        includeHiddenElements: true,
      }),
    ).toHaveProp('accessible', false);

    fireEvent(sheet, 'accessibilityEscape');
    fireEvent(view.UNSAFE_getByType(RNModal), 'requestClose');

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('restores screen-reader focus to the supplied launching control after dismissal', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const setFocus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);

    function Harness(): React.ReactNode {
      const [visible, setVisible] = React.useState(true);
      const triggerRef = React.useRef<View>(42 as unknown as View);
      return (
        <>
          <View testID="launch-control" accessible />
          <Modal
            visible={visible}
            onClose={() => setVisible(false)}
            title="Preferences"
            returnFocusRef={triggerRef}
            testID="preferences-dialog"
          >
            <View />
          </Modal>
        </>
      );
    }

    const view = render(<Harness />);
    const callsBeforeDismissal = setFocus.mock.calls.length;

    fireEvent(
      screen.getByTestId('preferences-dialog'),
      'accessibilityEscape',
    );
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeDismissal);

    const nativeModal = view.UNSAFE_getByType(RNModal);
    fireEvent(nativeModal, 'dismiss');

    expect(setFocus).toHaveBeenCalledTimes(callsBeforeDismissal + 1);
    fireEvent(nativeModal, 'dismiss');
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeDismissal + 1);
  });

  it('restores screen-reader focus after dismissing a bottom sheet', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const setFocus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);

    function Harness(): React.ReactNode {
      const [visible, setVisible] = React.useState(true);
      const triggerRef = React.useRef<View>(42 as unknown as View);
      return (
        <BottomSheet
          visible={visible}
          onClose={() => setVisible(false)}
          returnFocusRef={triggerRef}
          testID="select-sheet"
        >
          <View />
        </BottomSheet>
      );
    }

    const view = render(<Harness />);
    const callsBeforeDismissal = setFocus.mock.calls.length;

    fireEvent(screen.getByTestId('select-sheet'), 'accessibilityEscape');
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeDismissal);

    const nativeModal = view.UNSAFE_getByType(RNModal);
    fireEvent(nativeModal, 'dismiss');
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeDismissal + 1);
    fireEvent(nativeModal, 'dismiss');
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeDismissal + 1);
  });

  it('restores focus after the Android system-back commit without a dismiss event', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const setFocus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);

    function Harness(): React.ReactNode {
      const [visible, setVisible] = React.useState(true);
      const triggerRef = React.useRef<View>(42 as unknown as View);
      return (
        <BottomSheet
          visible={visible}
          onClose={() => setVisible(false)}
          returnFocusRef={triggerRef}
          testID="android-sheet"
        >
          <View />
        </BottomSheet>
      );
    }

    const view = render(<Harness />);
    const nativeModal = view.UNSAFE_getByType(RNModal);
    const callsBeforeClose = setFocus.mock.calls.length;
    fireEvent(nativeModal, 'requestClose');

    expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
    fireEvent(nativeModal, 'dismiss');
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
  });

  it('does not restore focus for an Android sheet that was never presented', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const setFocus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    setFocus.mockClear();
    const triggerRef = { current: 42 as unknown as View };
    const onDismiss = jest.fn();
    const view = render(
      <BottomSheet
        visible={false}
        onClose={jest.fn()}
        onDismiss={onDismiss}
        returnFocusRef={triggerRef}
        testID="hidden-sheet"
      >
        <View />
      </BottomSheet>,
    );

    expect(setFocus).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent(view.UNSAFE_getByType(RNModal), 'dismiss');
    expect(setFocus).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
