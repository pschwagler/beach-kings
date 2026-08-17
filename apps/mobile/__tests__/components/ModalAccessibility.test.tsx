import React from 'react';
import { AccessibilityInfo, Modal as RNModal, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import BottomSheet from '@/components/ui/BottomSheet';
import Modal from '@/components/ui/Modal';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
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

    render(<Harness />);
    const callsBeforeDismissal = setFocus.mock.calls.length;

    fireEvent(
      screen.getByTestId('preferences-dialog'),
      'accessibilityEscape',
    );

    expect(setFocus.mock.calls.length).toBeGreaterThan(callsBeforeDismissal);
  });

  it('restores screen-reader focus after dismissing a bottom sheet', () => {
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

    render(<Harness />);
    const callsBeforeDismissal = setFocus.mock.calls.length;

    fireEvent(screen.getByTestId('select-sheet'), 'accessibilityEscape');

    expect(setFocus.mock.calls.length).toBeGreaterThan(callsBeforeDismissal);
  });
});
