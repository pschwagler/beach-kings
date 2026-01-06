import React, { useState, useEffect } from 'react';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { LeaguesTab } from '../../src/components/home/LeaguesTab';
import { useRouter } from 'expo-router';

export default function LeaguesScreen() {
  const { isAuthenticated } = useAuth();
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

  const handleLeagueClick = (action: string, leagueId?: number) => {
    if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
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
    <LeaguesTab
      userLeagues={userLeagues}
      onLeagueClick={handleLeagueClick}
      onLeaguesUpdate={handleLeaguesUpdate}
    />
  );
}
