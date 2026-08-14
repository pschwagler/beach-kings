import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import DeleteAccountDialog from '@/components/screens/Settings/DeleteAccountDialog';
import { renderWithTheme as render } from '../../test-utils/renderWithTheme';

jest.mock('nativewind', () => ({
  useColorScheme: () => ({
    colorScheme: 'light',
    setColorScheme: jest.fn(),
  }),
  vars: (values: object) => values,
}));

jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

function props(
  overrides: Partial<React.ComponentProps<typeof DeleteAccountDialog>> = {},
): React.ComponentProps<typeof DeleteAccountDialog> {
  return {
    visible: true,
    isPending: false,
    onCancel: jest.fn(),
    onSchedule: jest.fn(),
    onDeleteNow: jest.fn(),
    ...overrides,
  };
}

describe('DeleteAccountDialog', () => {
  it('keeps scheduled and immediate deletion isolated from the underlying screen', () => {
    render(<DeleteAccountDialog {...props()} />);

    expect(screen.getByTestId('delete-account-dialog')).toBeTruthy();
    expect(screen.getByTestId('delete-account-schedule')).toBeTruthy();
    expect(screen.getByTestId('delete-account-now')).toBeTruthy();
  });

  it('requires a second confirmation before immediate deletion', () => {
    const onDeleteNow = jest.fn();
    render(<DeleteAccountDialog {...props({ onDeleteNow })} />);

    fireEvent.press(screen.getByTestId('delete-account-now'));
    expect(onDeleteNow).not.toHaveBeenCalled();
    expect(screen.getByText('This action cannot be undone.', { exact: false })).toBeTruthy();

    fireEvent.press(screen.getByTestId('delete-account-confirm-now'));
    expect(onDeleteNow).toHaveBeenCalledTimes(1);
  });

  it('supports a schedule-only restricted-account flow', () => {
    render(
      <DeleteAccountDialog
        {...props({ allowImmediateDeletion: false, onDeleteNow: undefined })}
      />,
    );

    expect(screen.queryByTestId('delete-account-now')).toBeNull();
    expect(screen.getByTestId('delete-account-schedule')).toBeTruthy();
  });

  it('prevents dismissal while a deletion request is pending', () => {
    const onCancel = jest.fn();
    render(<DeleteAccountDialog {...props({ isPending: true, onCancel })} />);

    fireEvent.press(screen.getByTestId('delete-account-dialog-backdrop'));
    fireEvent.press(screen.getByTestId('delete-account-cancel'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('announces request failures inside the modal', () => {
    render(
      <DeleteAccountDialog
        {...props({ errorMessage: 'Could not schedule deletion.' })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not schedule deletion.');
  });
});
