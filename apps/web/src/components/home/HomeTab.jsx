'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, Target, Award, HelpCircle } from 'lucide-react';
import MyLeaguesWidget from '../dashboard/MyLeaguesWidget';
import MyMatchesWidget from '../dashboard/MyMatchesWidget';
import { getPlayerMatchHistory } from '../../services/api';

const getAvatarInitial = (currentUserPlayer) => {
  if (currentUserPlayer?.nickname) {
    return currentUserPlayer.nickname.trim().charAt(0).toUpperCase();
  }
  if (currentUserPlayer?.full_name) {
    return currentUserPlayer.full_name.trim().charAt(0).toUpperCase();
  }
  return '?';
};

export default function HomeTab({ currentUserPlayer, userLeagues, onTabChange, onLeaguesUpdate }) {
  const router = useRouter();
  const [userMatches, setUserMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Load user matches
  useEffect(() => {
    const loadUserMatches = async () => {
      if (!currentUserPlayer) return;
      
      setLoadingMatches(true);
      try {
        const playerId = currentUserPlayer.id;
        if (!playerId) {
          setUserMatches([]);
          return;
        }

        const matches = await getPlayerMatchHistory(playerId);
        const sortedMatches = (matches || [])
          .sort((a, b) => {
            const dateA = a.Date ? new Date(a.Date).getTime() : 0;
            const dateB = b.Date ? new Date(b.Date).getTime() : 0;
            return dateB - dateA;
          });
        setUserMatches(sortedMatches);
      } catch (error) {
        console.error('Error loading user matches:', error);
        setUserMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    };

    loadUserMatches();
  }, [currentUserPlayer]);

  const navigateToLeague = (leagueId) => {
    router.push(`/league/${leagueId}`);
  };

  const avatarInitial = getAvatarInitial(currentUserPlayer);
  const fullName = currentUserPlayer?.full_name || 'Player';

  // Calculate stats from match history
  const calculateStatsFromMatches = () => {
    if (!userMatches || userMatches.length === 0) {
      // Fall back to global stats if available, otherwise use defaults
      return {
        totalGames: currentUserPlayer?.stats?.total_games ?? 0,
        currentRating: currentUserPlayer?.stats?.current_rating ?? 0,
        games30Days: 0,
        winRate30Days: 0
      };
    }

    // Filter out pending matches (active sessions)
    const completedMatches = userMatches.filter(match => {
      const sessionStatus = match['Session Status'];
      return sessionStatus !== 'ACTIVE';
    });

    // Calculate total games from completed matches
    const totalGames = completedMatches.length;

    // Calculate current rating from most recent completed match
    let currentRating = currentUserPlayer?.stats?.current_rating || 1200;
    if (completedMatches.length > 0) {
      // Sort by date to get most recent
      const sortedMatches = [...completedMatches].sort((a, b) => {
        const dateA = a.Date ? new Date(a.Date).getTime() : 0;
        const dateB = b.Date ? new Date(b.Date).getTime() : 0;
        return dateB - dateA;
      });
      
      // Get rating from most recent match
      const mostRecentMatch = sortedMatches[0];
      if (mostRecentMatch['ELO After'] !== undefined && mostRecentMatch['ELO After'] !== null) {
        currentRating = mostRecentMatch['ELO After'];
      }
    }

    // Calculate 30-day stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentMatches = completedMatches.filter(match => {
      if (!match.Date) return false;
      const matchDate = new Date(match.Date);
      return matchDate >= thirtyDaysAgo;
    });

    const games30Days = recentMatches.length;
    const wins = recentMatches.filter(match => match.Result === 'W').length;
    const winRate30Days = games30Days > 0 ? Math.round((wins / games30Days) * 100) : 0;

    return { totalGames, currentRating, games30Days, winRate30Days };
  };

  const { totalGames, currentRating, games30Days, winRate30Days } = calculateStatsFromMatches();

  return (
    <div className="home-tab-container">
      {/* Top Header Row */}
      <div className="home-header-row">
        <div 
          className="home-header-left"
          onClick={() => onTabChange('profile')}
          style={{ cursor: 'pointer' }}
        >
          <div className="navbar-avatar" style={{ marginRight: '12px' }}>
            {avatarInitial}
          </div>
          <span className="home-header-name">{fullName}</span>
        </div>
        <div className="home-header-right">
          <button 
            className="home-header-icon-btn"
            onClick={() => onTabChange('friends')}
            title="Friends"
          >
            <Users size={22} />
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="home-stats-row">
        <div className="home-stat-card">
          <Target size={24} className="home-stat-icon" />
          <div className="home-stat-label">Total Games Played</div>
          <div className="home-stat-value">{totalGames}</div>
        </div>
        <div className="home-stat-card">
          <TrendingUp size={24} className="home-stat-icon" />
          <div className="home-stat-label">Rating</div>
          <div className="home-stat-value">
            {totalGames === 0 && currentRating === 0 ? '—' : Math.round(currentRating)}
          </div>
        </div>
        <div className="home-stat-card">
          <Target size={24} className="home-stat-icon" />
          <div className="home-stat-label">Games Played (Last 30 days)</div>
          <div className="home-stat-value">{games30Days}</div>
        </div>
        <div className="home-stat-card">
          <Award size={24} className="home-stat-icon" />
          <div className="home-stat-label">Win Rate (Last 30 days)</div>
          <div className="home-stat-value">{games30Days > 0 ? `${winRate30Days}%` : '—'}</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="home-content-grid">
        <MyLeaguesWidget 
          leagues={userLeagues}
          onLeagueClick={navigateToLeague}
          onLeaguesUpdate={onLeaguesUpdate}
        />
        <MyMatchesWidget 
          matches={userMatches}
          currentUserPlayer={currentUserPlayer}
        />
      </div>
    </div>
  );
}

