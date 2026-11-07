import React, { createRef } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { View, type GestureResponderEvent } from 'react-native';
import InlineSessionDate, { type InlineSessionDateHandle } from '@/components/screens/Sessions/InlineSessionDate';

jest.mock('@/components/screens/Sessions/InlineDateNavigationGuard', () => () => null);

jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@/theme/usePaletteColors', () => ({ usePaletteColors: () => ({ brandTeal: 'teal' }) }));
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: object) => <View {...props} />;
});

const date = '2026-11-07';
const next = new Date(2026, 10, 8, 12);
const defaults = { sessionId: 1, sessionNumber: 2, date, canEdit: true };

it('leaves read-only dates readable without an edit affordance', () => {
  const save = jest.fn();
  const ui = render(<InlineSessionDate {...defaults} canEdit={false} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  expect(ui.queryByTestId('session-date-inline')).toBeNull();
  expect(ui.queryByText('Edit date')).toBeNull();
  expect(ui.getByText('11/7/2026 · Session #2')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});

it('opens inline and dismisses an unchanged draft without a write', async () => {
  const save = jest.fn();
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  expect(ui.getByTestId('session-date-inline-picker').props.value).toEqual(new Date(2026, 10, 7, 12));
  fireEvent.press(ui.getByTestId('session-date-done'));
  await waitFor(() => expect(ui.queryByTestId('session-date-inline')).toBeNull());
  expect(save).not.toHaveBeenCalled();
});

it('retains a changed draft across background refetch and commits only once', async () => {
  let resolve!: (value: boolean) => void;
  const save = jest.fn(() => new Promise<boolean>((done) => { resolve = done; }));
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  fireEvent(ui.getByTestId('session-date-inline-picker'), 'onChange', { type: 'set' }, next);
  ui.rerender(<InlineSessionDate {...defaults} date="2026-11-06" onSave={save} />);
  expect(ui.getByTestId('session-date-inline-picker').props.value).toEqual(next);
  fireEvent.press(ui.getByTestId('session-date-done'));
  fireEvent.press(ui.getByTestId('session-date-done'));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('2026-11-08');
  await act(async () => { resolve(true); });
  expect(ui.queryByTestId('session-date-inline')).toBeNull();
});

it('keeps a rejected draft editable and retryable', async () => {
  const save = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  fireEvent(ui.getByTestId('session-date-inline-picker'), 'onChange', { type: 'set' }, next);
  fireEvent.press(ui.getByTestId('session-date-done'));
  await ui.findByTestId('session-date-error');
  expect(ui.getByTestId('session-date-inline-picker').props.value).toEqual(next);
  fireEvent.press(ui.getByTestId('session-date-done'));
  await waitFor(() => expect(ui.queryByTestId('session-date-inline')).toBeNull());
  expect(save).toHaveBeenCalledTimes(2);
});

it('commits a changed draft on an outside touch, not calendar touches', async () => {
  const save = jest.fn().mockResolvedValue(true);
  const ref = createRef<InlineSessionDateHandle>();
  const ui = render(<InlineSessionDate {...defaults} ref={ref} onSave={save} />, {
    createNodeMock: () => ({ measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) => callback(10, 10, 300, 400) }),
  });
  const measured = ui.UNSAFE_getAllByType(View).find((node) => node.props.testID === 'session-date-editor')!;
  measured.instance.measureInWindow = (callback: (x: number, y: number, w: number, h: number) => void) => callback(10, 10, 300, 400);
  fireEvent.press(ui.getByTestId('session-date-label'));
  fireEvent(ui.getByTestId('session-date-inline-picker'), 'onChange', { type: 'set' }, next);
  act(() => ref.current?.refreshBounds());
  act(() => expect(ref.current?.handleOutsideTouch({ nativeEvent: { pageX: 50, pageY: 100 } } as GestureResponderEvent)).toBe(false));
  expect(save).not.toHaveBeenCalled();
  act(() => expect(ref.current?.handleOutsideTouch({ nativeEvent: { pageX: 350, pageY: 500 } } as GestureResponderEvent)).toBe(true));
  await waitFor(() => expect(save).toHaveBeenCalledWith('2026-11-08'));
});

it('ignores completion from an old session after switching sessions', async () => {
  let resolve!: (value: boolean) => void;
  const save = jest.fn(() => new Promise<boolean>((done) => { resolve = done; }));
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  fireEvent(ui.getByTestId('session-date-inline-picker'), 'onChange', { type: 'set' }, next);
  fireEvent.press(ui.getByTestId('session-date-done'));
  ui.rerender(<InlineSessionDate {...defaults} sessionId={2} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  await act(async () => { resolve(true); });
  expect(ui.getByTestId('session-date-inline')).toBeTruthy();
});

it('can discard a failed draft without another write', async () => {
  const save = jest.fn().mockRejectedValue(new Error('offline'));
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  fireEvent(ui.getByTestId('session-date-inline-picker'), 'onChange', { type: 'set' }, next);
  fireEvent.press(ui.getByTestId('session-date-done'));
  await ui.findByTestId('session-date-error');
  fireEvent.press(ui.getByTestId('session-date-cancel'));
  expect(ui.queryByTestId('session-date-inline')).toBeNull();
  expect(ui.getByText('11/7/2026 · Session #2')).toBeTruthy();
  expect(save).toHaveBeenCalledTimes(1);
});

it('ignores a delayed old-session measurement before it can trigger a write', async () => {
  const oldSave = jest.fn().mockResolvedValue(true);
  const newSave = jest.fn().mockResolvedValue(true);
  const ref = createRef<InlineSessionDateHandle>();
  const ui = render(<InlineSessionDate {...defaults} ref={ref} onSave={oldSave} />);
  const measured = ui.UNSAFE_getAllByType(View).find((node) => node.props.testID === 'session-date-editor')!;
  let oldMeasurement!: (x: number, y: number, w: number, h: number) => void;
  measured.instance.measureInWindow = (callback: typeof oldMeasurement) => { oldMeasurement = callback; };
  fireEvent.press(ui.getByTestId('session-date-label'));
  act(() => ref.current?.refreshBounds());
  ui.rerender(<InlineSessionDate {...defaults} sessionId={2} date="2026-11-09" ref={ref} onSave={newSave} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  fireEvent(ui.getByTestId('session-date-inline-picker'), 'onChange', { type: 'set' }, new Date(2026, 10, 10, 12));
  act(() => oldMeasurement(10, 10, 300, 400));
  act(() => { ref.current?.handleOutsideTouch({ nativeEvent: { pageX: 350, pageY: 500 } } as GestureResponderEvent); });
  expect(oldSave).not.toHaveBeenCalled();
  expect(newSave).not.toHaveBeenCalled();
  measured.instance.measureInWindow = (callback: typeof oldMeasurement) => callback(10, 10, 300, 400);
  act(() => ref.current?.refreshBounds());
  act(() => { ref.current?.handleOutsideTouch({ nativeEvent: { pageX: 350, pageY: 500 } } as GestureResponderEvent); });
  await waitFor(() => expect(newSave).toHaveBeenCalledWith('2026-11-10'));
  expect(oldSave).not.toHaveBeenCalled();
});
