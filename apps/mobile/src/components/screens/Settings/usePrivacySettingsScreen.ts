/**
 * Data hook for the Privacy Settings screen.
 *
 * Manages the `show_game_history` toggle with optimistic updates and
 * revert-on-error behaviour.
 *
 * NOTE: The `profile_is_private` feature is intentionally deferred from the
 * UI. The backend/API/AuthContext plumbing (UserMeResponse, UpdateUser,
 * api.updateUserProfile) remains intact so re-enabling the toggle is a
 * one-file change here and in PrivacySettingsScreen.tsx.
 */

import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

export interface UsePrivacySettingsScreenResult {
  /** Current value for the "Show game history" toggle. */
  readonly showGameHistory: boolean;
  /** Toggle handler for `show_game_history`. */
  readonly handleToggleShowGameHistory: (value: boolean) => void;
}

export function usePrivacySettingsScreen(): UsePrivacySettingsScreenResult {
  const { user, refreshUser } = useAuth();

  const [showGameHistory, setShowGameHistory] = useState(
    user?.show_game_history ?? false,
  );

  const handleToggleShowGameHistory = useCallback(
    (value: boolean) => {
      // Optimistic update
      setShowGameHistory(value);

      void api
        .updateUserProfile({ show_game_history: value })
        .then(() => refreshUser())
        .catch(() => {
          // Revert on error
          setShowGameHistory(!value);
          Alert.alert('Error', 'Could not update privacy setting. Please try again.');
        });
    },
    [refreshUser],
  );

  return {
    showGameHistory,
    handleToggleShowGameHistory,
  };
}
