import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import FindPlayersScreen from '../src/components/find-players/FindPlayersScreen';

/**
 * Find Players route — pushes from HomeTab's Users icon.
 * Requires authentication; redirects to index if not authed.
 */
export default function FindPlayersPage(): React.ReactNode {
  const { isAuthenticated, isInitializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isInitializing, router]);

  if (isInitializing || !isAuthenticated) {
    return null;
  }

  return <FindPlayersScreen />;
}
