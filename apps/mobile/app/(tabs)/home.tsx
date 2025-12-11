import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { HomeTab } from '../../src/components/home/HomeTab';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const { isAuthenticated, currentUserPlayer } = useAuth();
  const router = useRouter();
  const [userLeagues, setUserLeagues] = useState<any[]>([]);

  // Load user leagues
  useEffect(() => {
    const loadUserLeagues = async () => {
      if (isAuthenticated) {
        try {
          const leagues = await api.getUserLeagues();
          setUserLeagues(leagues);
        } catch (err) {
          console.error('Error loading user leagues:', err);
        }
      }
    };
    loadUserLeagues();
  }, [isAuthenticated]);

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


