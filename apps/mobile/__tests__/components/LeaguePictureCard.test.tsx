import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LeaguePictureCard from '@/components/screens/Leagues/LeaguePictureCard';

jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
const mockChange = jest.fn();
const mockPick = jest.fn();
const mockRefetch = jest.fn();
let mockUserId = 1;
let mockQuery: Record<string, unknown>;
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));
jest.mock('@/features/leagues/useLeaguePicture', () => ({ useLeaguePicture: () => ({
  query: mockQuery, mutation: { isPending: false, isError: false }, changePicture: mockChange,
}) }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockPick(...args),
  MediaTypeOptions: { Images: 'images' },
}));
beforeEach(() => {
  mockUserId = 1;
  mockQuery = { data: { data_uri: null, revision: null }, isPending: false, isError: false, refetch: mockRefetch };
  mockChange.mockReset().mockResolvedValue(undefined);
  mockPick.mockReset().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picture.jpg', mimeType: 'image/jpeg' }] });
});

it('allows admins to choose a league picture without requesting broad library access', async () => {
  const ui = render(<LeaguePictureCard leagueId={3} leagueName="Test league" canEdit />);
  fireEvent.press(ui.getByLabelText('Add league picture'));
  await waitFor(() => expect(mockChange).toHaveBeenCalledWith({ kind: 'upload', file: {
    uri: 'file:///picture.jpg', name: 'league-picture.jpg', type: 'image/jpeg',
  } }));
  expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: false }));
});

it('shows a member the picture without editing controls or persistent image caching', () => {
  mockQuery.data = { data_uri: 'data:image/jpeg;base64,dGVzdA==', revision: 'new' };
  const ui = render(<LeaguePictureCard leagueId={3} leagueName="Test league" canEdit={false} />);
  expect(ui.getByTestId('league-picture').props.cachePolicy).toBe('none');
  expect(ui.queryByLabelText('Change league picture')).toBeNull();
  expect(ui.queryByLabelText('Remove league picture')).toBeNull();
});

it('hides cached picture data when the membership read is rejected', () => {
  mockQuery.data = { data_uri: 'data:image/jpeg;base64,dGVzdA==', revision: 'old' };
  mockQuery.isError = true;
  const ui = render(<LeaguePictureCard leagueId={3} leagueName="Test league" canEdit={false} />);
  expect(ui.queryByTestId('league-picture')).toBeNull();
  expect(ui.getByLabelText('Retry league picture')).toBeTruthy();
});

it('ignores a picker that returns after an account or league change', async () => {
  let finish!: (value: unknown) => void;
  mockPick.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const ui = render(<LeaguePictureCard leagueId={3} leagueName="First league" canEdit />);
  fireEvent.press(ui.getByLabelText('Add league picture'));
  mockUserId = 2;
  ui.rerender(<LeaguePictureCard leagueId={4} leagueName="Other league" canEdit />);
  await act(async () => { finish({ canceled: false, assets: [{ uri: 'file:///old.jpg' }] }); });
  expect(mockChange).not.toHaveBeenCalled();
});

it('ignores an old removal confirmation after losing the admin role', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockQuery.data = { data_uri: 'data:image/jpeg;base64,dGVzdA==', revision: 'old' };
  const ui = render(<LeaguePictureCard leagueId={3} leagueName="Test league" canEdit />);
  fireEvent.press(ui.getByLabelText('Remove league picture'));
  const confirm = alert.mock.calls[0][2]?.find((button) => button.text === 'Remove');
  ui.rerender(<LeaguePictureCard leagueId={3} leagueName="Test league" canEdit={false} />);
  act(() => { confirm?.onPress?.(); });
  expect(mockChange).not.toHaveBeenCalled();
  alert.mockRestore();
});
