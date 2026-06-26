/**
 * Data hook for the Privacy Settings screen.
 *
 * Manages `profile_is_private` and `show_game_history` toggles with optimistic
 * updates and revert-on-error behaviour.
 */

import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

export interface UsePrivacySettingsScreenResult {
  /** Current value for the "Private profile" toggle. */
  readonly profileIsPrivate: boolean;
  /** Current value for the "Show game history" toggle. */
  readonly showGameHistory: boolean;
  /** Toggle handler for `profile_is_private`. */
  readonly handleTogglePrivateProfile: (value: boolean) => void;
  /** Toggle handler for `show_game_history`. */
  readonly handleToggleShowGameHistory: (value: boolean) => void;
}

export function usePrivacySettingsScreen(): UsePrivacySettingsScreenResult {
  const { user, refreshUser } = useAuth();

  const [profileIsPrivate, setProfileIsPrivate] = useState(
    user?.profile_is_private ?? false,
  );
  const [showGameHistory, setShowGameHistory] = useState(
    user?.show_game_history ?? false,
  );

  const handleTogglePrivateProfile = useCallback(
    (value: boolean) => {
      // Optimistic update
      setProfileIsPrivate(value);

      void api
        .updateUserProfile({ profile_is_private: value })
        .then(() => refreshUser())
        .catch(() => {
          // Revert on error
          setProfileIsPrivate(!value);
          Alert.alert('Error', 'Could not update privacy setting. Please try again.');
        });
    },
    [refreshUser],
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
    profileIsPrivate,
    showGameHistory,
    handleTogglePrivateProfile,
    handleToggleShowGameHistory,
  };
}
