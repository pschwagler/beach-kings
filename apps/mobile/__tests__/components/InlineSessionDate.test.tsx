import React, { createRef } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { View, TouchableOpacity, type GestureResponderEvent } from 'react-native';
import SessionDateField from '@/components/screens/Sessions/SessionDateField';
import InlineSessionDate, { type InlineSessionDateHandle } from '@/components/screens/Sessions/InlineSessionDate';

jest.mock('@/components/screens/Sessions/InlineDateNavigationGuard', () => () => null);
jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@/theme/usePaletteColors', () => ({ usePaletteColors: () => ({ brandTeal: 'teal' }) }));
jest.mock('@/components/ui/icons', () => ({ CalendarIcon: () => null, ChevronRightIcon: () => null }));
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: object) => <View {...props} />;
});

const date = '2026-11-07';
const next = new Date(2026, 10, 8, 12);
const defaults = { sessionId: 1, sessionNumber: 2, date, canEdit: true };
type UI = ReturnType<typeof render>;
function openSheet(ui: UI) {
  fireEvent.press(ui.getByTestId('session-date-label'));
  fireEvent.press(ui.getByTestId('session-date-field'));
}
function selectNext(ui: UI) {
  fireEvent(ui.getByTestId('session-date-field-picker'), 'onChange', { type: 'set' }, next);
}
const outside = { nativeEvent: { pageX: 350, pageY: 500 } } as GestureResponderEvent;

it('keeps readonly dates readable without an editing affordance', () => {
  const save = jest.fn();
  const ui = render(<InlineSessionDate {...defaults} canEdit={false} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  expect(ui.queryByTestId('session-date-inline')).toBeNull();
  expect(ui.getByText('11/7/2026 · Session #2')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});

it('first reveals the existing date row and only the second tap opens its sheet', () => {
  const save = jest.fn();
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  fireEvent.press(ui.getByTestId('session-date-label'));
  expect(ui.getByRole('button', { name: 'Session date' })).toBeTruthy();
  expect(ui.queryByTestId('session-date-field-picker')).toBeNull();
  fireEvent.press(ui.getByTestId('session-date-field'));
  expect(ui.getByTestId('session-date-field-sheet')).toBeTruthy();
  expect(ui.getByTestId('session-date-field-picker').props.value).toEqual(new Date(2026, 10, 7, 12));
  expect(save).not.toHaveBeenCalled();
});

it('Done on an unchanged sheet restores the header without writing', async () => {
  const save = jest.fn();
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  openSheet(ui);
  fireEvent.press(ui.getByTestId('session-date-field-done'));
  await waitFor(() => expect(ui.queryByTestId('session-date-inline')).toBeNull());
  expect(save).not.toHaveBeenCalled();
});

it.each(['cancel', 'backdrop'])('sheet %s discards only its draft and leaves the compact row', (dismiss) => {
  const save = jest.fn();
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  openSheet(ui);
  selectNext(ui);
  fireEvent.press(ui.getByTestId(`session-date-field-${dismiss}`));
  expect(ui.queryByTestId('session-date-field-picker')).toBeNull();
  fireEvent.press(ui.getByTestId('session-date-field'));
  expect(ui.getByTestId('session-date-field-picker').props.value).toEqual(new Date(2026, 10, 7, 12));
  expect(save).not.toHaveBeenCalled();
});

it('sheet Done saves only once and restores the header only after confirmation', async () => {
  let resolve!: (value: boolean) => void;
  const save = jest.fn(() => new Promise<boolean>((done) => { resolve = done; }));
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  openSheet(ui);
  selectNext(ui);
  const done = ui.UNSAFE_getAllByType(TouchableOpacity).find((node) => node.props.testID === 'session-date-field-done')!.props.onPress;
  act(() => { done(); done(); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('2026-11-08');
  expect(ui.getByTestId('session-date-field')).toBeDisabled();
  expect(ui.queryByTestId('session-date-label')).toBeNull();
  await act(async () => { resolve(true); });
  expect(ui.getByTestId('session-date-label')).toBeTruthy();
});

it('retains a rejected selected draft in the compact row, can reopen it, then Retry', async () => {
  const save = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  openSheet(ui);
  selectNext(ui);
  fireEvent.press(ui.getByTestId('session-date-field-done'));
  await ui.findByTestId('session-date-error');
  expect(ui.getByTestId('session-date-field').props.accessibilityValue.text).toContain('Nov 8, 2026');
  fireEvent.press(ui.getByTestId('session-date-field'));
  expect(ui.getByTestId('session-date-field-picker').props.value).toEqual(next);
  fireEvent.press(ui.getByTestId('session-date-field-cancel'));
  fireEvent.press(ui.getByTestId('session-date-retry'));
  await waitFor(() => expect(ui.queryByTestId('session-date-inline')).toBeNull());
  expect(save).toHaveBeenCalledTimes(2);
});

it('can discard a failed selected date without another write', async () => {
  const save = jest.fn().mockRejectedValue(new Error('offline'));
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  openSheet(ui);
  selectNext(ui);
  fireEvent.press(ui.getByTestId('session-date-field-done'));
  await ui.findByTestId('session-date-error');
  fireEvent.press(ui.getByTestId('session-date-cancel'));
  expect(ui.getByText('11/7/2026 · Session #2')).toBeTruthy();
  expect(save).toHaveBeenCalledTimes(1);
});

it('does not consume Modal touches, then consumes the first outside compact-row touch without writing', () => {
  const save = jest.fn();
  const ref = createRef<InlineSessionDateHandle>();
  const ui = render(<InlineSessionDate {...defaults} ref={ref} onSave={save} />);
  const measured = ui.UNSAFE_getAllByType(View).find((node) => node.props.testID === 'session-date-editor')!;
  measured.instance.measureInWindow = (callback: (x: number, y: number, w: number, h: number) => void) => callback(10, 10, 300, 68);
  openSheet(ui);
  act(() => ref.current?.refreshBounds());
  act(() => expect(ref.current?.handleOutsideTouch(outside)).toBe(false));
  fireEvent.press(ui.getByTestId('session-date-field-cancel'));
  act(() => expect(ref.current?.handleOutsideTouch(outside)).toBe(true));
  expect(ui.queryByTestId('session-date-inline')).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it('ignores an old sheet Done callback and old save completion after switching sessions', async () => {
  let resolve!: (value: boolean) => void;
  const save = jest.fn(() => new Promise<boolean>((done) => { resolve = done; }));
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  openSheet(ui);
  selectNext(ui);
  const oldDone = ui.UNSAFE_getAllByType(TouchableOpacity).find((node) => node.props.testID === 'session-date-field-done')!.props.onPress;
  act(() => oldDone());
  ui.rerender(<InlineSessionDate {...defaults} sessionId={2} onSave={save} />);
  openSheet(ui);
  act(() => oldDone());
  await act(async () => { resolve(true); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(ui.getByTestId('session-date-field-picker')).toBeTruthy();
});

it('keeps the current sheet draft across a background server-date refresh', () => {
  const save = jest.fn();
  const ui = render(<InlineSessionDate {...defaults} onSave={save} />);
  openSheet(ui);
  selectNext(ui);
  ui.rerender(<InlineSessionDate {...defaults} date="2026-11-06" onSave={save} />);
  expect(ui.getByTestId('session-date-field-picker').props.value).toEqual(next);
  expect(save).not.toHaveBeenCalled();
});

 it('shared field reports picker visibility without changing its baseline Cancel/Done contract', () => {
  const change = jest.fn();
  const visibility = jest.fn();
  const ui = render(<SessionDateField value={date} testID="shared-date" onChange={change} onPickerOpenChange={visibility} />);
  fireEvent.press(ui.getByTestId('shared-date'));
  expect(visibility).toHaveBeenLastCalledWith(true);
  fireEvent(ui.getByTestId('shared-date-picker'), 'onChange', { type: 'set' }, next);
  fireEvent.press(ui.getByTestId('shared-date-cancel'));
  expect(visibility).toHaveBeenLastCalledWith(false);
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(ui.getByTestId('shared-date'));
  fireEvent(ui.getByTestId('shared-date-picker'), 'onChange', { type: 'set' }, next);
  fireEvent.press(ui.getByTestId('shared-date-done'));
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith('2026-11-08');
  expect(visibility).toHaveBeenLastCalledWith(false);
 });
 it('shared disabled row does not open a picker or change dates', () => {
  const change = jest.fn();
  const visibility = jest.fn();
  const ui = render(<SessionDateField value={date} testID="shared-date" onChange={change} disabled onPickerOpenChange={visibility} />);
  fireEvent.press(ui.getByTestId('shared-date'));
  expect(ui.queryByTestId('shared-date-picker')).toBeNull();
  expect(visibility).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
 });
