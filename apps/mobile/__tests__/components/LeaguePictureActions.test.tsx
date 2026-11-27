import React, { type ComponentProps } from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LeaguePictureActions from '@/components/screens/Leagues/LeaguePictureActions';

jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
const mockChange = jest.fn();
const mockPick = jest.fn();
const mockRefetch = jest.fn();
let mockUserId = 1;
type Management = ComponentProps<typeof LeaguePictureActions>['management'];
let mockQuery: Management['query'];
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));
function Card({ leagueId, canEdit }: { leagueId: number; canEdit: boolean }) {
  const management: Management = {
    query: mockQuery,
    mutation: { isPending: false, isError: false, error: null, variables: undefined },
    changePicture: mockChange,
  };
  return <LeaguePictureActions leagueId={leagueId} canEdit={canEdit} management={management} />;
}

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockPick(...args),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
beforeEach(() => {
  mockUserId = 1;
  mockQuery = { data: { data_uri: null, revision: null }, isPending: false, isError: false, refetch: mockRefetch };
  mockChange.mockReset().mockResolvedValue(undefined);
  mockPick.mockReset().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picture.jpg', mimeType: 'image/jpeg' }] });
});

it('allows admins to choose a league picture without requesting broad library access', async () => {
  const ui = render(<Card leagueId={3} canEdit />);
  fireEvent.press(ui.getByRole('button', { name: 'Choose photo' }));
  await waitFor(() => expect(mockChange).toHaveBeenCalledWith({ kind: 'upload', file: {
    uri: 'file:///picture.jpg', name: 'league-picture.jpg', type: 'image/jpeg',
  } }));
  expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({
    mediaTypes: ['images'], allowsEditing: false, preferredAssetRepresentationMode: 'compatible',
  }));
});

it('keeps successful picture management out of the Info tab for regular members', () => {
  mockQuery.data = { data_uri: 'data:image/jpeg;base64,dGVzdA==', revision: 'new' };
  const ui = render(<Card leagueId={3} canEdit={false} />);
  expect(ui.queryByTestId('league-picture-actions')).toBeNull();
  expect(ui.queryByRole('button', { name: 'Replace photo' })).toBeNull();
  expect(ui.queryByRole('button', { name: 'Remove photo' })).toBeNull();
});

it('hides cached picture data when the membership read is rejected', () => {
  mockQuery.data = { data_uri: 'data:image/jpeg;base64,dGVzdA==', revision: 'old' };
  mockQuery.isError = true;
  const ui = render(<Card leagueId={3} canEdit={false} />);
  expect(ui.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Retry loading photo' }));
  expect(mockRefetch).toHaveBeenCalled();
});

it('ignores a picker that returns after an account or league change', async () => {
  let finish!: (value: unknown) => void;
  mockPick.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const ui = render(<Card leagueId={3} canEdit />);
  fireEvent.press(ui.getByRole('button', { name: 'Choose photo' }));
  mockUserId = 2;
  ui.rerender(<Card leagueId={4} canEdit />);
  await act(async () => { finish({ canceled: false, assets: [{ uri: 'file:///old.jpg' }] }); });
  expect(mockChange).not.toHaveBeenCalled();
});

it('ignores an old removal confirmation after losing the admin role', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockQuery.data = { data_uri: 'data:image/jpeg;base64,dGVzdA==', revision: 'old' };
  const ui = render(<Card leagueId={3} canEdit />);
  fireEvent.press(ui.getByRole('button', { name: 'Remove photo' }));
  const confirm = alert.mock.calls[0][2]?.find((button) => button.text === 'Remove');
  ui.rerender(<Card leagueId={3} canEdit={false} />);
  act(() => { confirm?.onPress?.(); });
  expect(mockChange).not.toHaveBeenCalled();
  alert.mockRestore();
});


it('removes the photo only after the admin confirms', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockQuery.data = { data_uri: 'data:image/jpeg;base64,dGVzdA==', revision: 'old' };
  const ui = render(<Card leagueId={3} canEdit />);
  fireEvent.press(ui.getByRole('button', { name: 'Remove photo' }));
  expect(mockChange).not.toHaveBeenCalled();

  const confirm = alert.mock.calls[0][2]?.find((button) => button.text === 'Remove');
  act(() => { confirm?.onPress?.(); });
  expect(mockChange).toHaveBeenCalledWith({ kind: 'remove' });
  alert.mockRestore();
});
