import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { HomeTab } from '../../src/components/home/HomeTab';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const { isAuthenticated, currentUserPlayer, fetchCurrentUser, isInitializing } = useAuth();
  const router = useRouter();
  const [userLeagues, setUserLeagues] = useState<any[]>([]);

  // Debug logging
  useEffect(() => {
    console.log('[HomeScreen] isAuthenticated:', isAuthenticated);
    console.log('[HomeScreen] currentUserPlayer:', currentUserPlayer);
    console.log('[HomeScreen] isInitializing:', isInitializing);
  }, [isAuthenticated, currentUserPlayer, isInitializing]);

  // Redirect to login if not authenticated (after initialization)
  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      console.log('[HomeScreen] Not authenticated, redirecting to login...');
      router.replace('/');
    }
  }, [isAuthenticated, isInitializing, router]);

  // Refetch user data if not available
  useEffect(() => {
    if (isAuthenticated && !currentUserPlayer) {
      console.log('[HomeScreen] Authenticated but no player data, fetching...');
      fetchCurrentUser();
    }
  }, [isAuthenticated, currentUserPlayer, fetchCurrentUser]);

  // Load user leagues
  useEffect(() => {
    const loadUserLeagues = async () => {
      if (isAuthenticated) {
        try {
          console.log('[HomeScreen] Loading user leagues...');
          const leagues = await api.getUserLeagues();
          console.log('[HomeScreen] Loaded leagues:', leagues?.length || 0);
          setUserLeagues(leagues || []);
        } catch (err: any) {
          console.error('[HomeScreen] Error loading user leagues:', err);
          console.error('[HomeScreen] Error details:', err.response?.data || err.message);
        }
      }
    };
    loadUserLeagues();
  }, [isAuthenticated]);

  // Show loading state while initializing
  if (isInitializing) {
    return null; // Or return a loading spinner component
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  const handleTabChange = (tab: string) => {
    if (tab === 'profile') {
      router.push('/(tabs)/profile');
    } else if (tab === 'friends') {
      // TODO: Navigate to friends tab when implemented
      console.log('Friends tab not yet implemented');
    }
  };

  const handleLeaguesUpdate = async () => {
    try {
      const leagues = await api.getUserLeagues();
      setUserLeagues(leagues);
    } catch (err) {
      console.error('Error updating leagues:', err);
    }
  };

  return (
    <HomeTab
      currentUserPlayer={currentUserPlayer}
      userLeagues={userLeagues}
      onTabChange={handleTabChange}
      onLeaguesUpdate={handleLeaguesUpdate}
    />
  );
}
