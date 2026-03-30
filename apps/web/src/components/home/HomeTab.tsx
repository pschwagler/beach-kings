'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, Target, Award } from 'lucide-react';
import MyLeaguesBar from '../dashboard/MyLeaguesBar';
import MyMatchesWidget from '../dashboard/MyMatchesWidget';
import { MySessionsWidget } from './OpenSessionsList';
import NearYouSection from './NearYouSection';
import { getPlayerMatchHistory } from '../../services/api';
import { isImageUrl } from '../../utils/avatar';
import type { Player, League } from '../../types';

const getAvatarInitial = (currentUserPlayer: Player | null): string => {
  if (currentUserPlayer?.nickname) {
    return currentUserPlayer.nickname.trim().charAt(0).toUpperCase();
  }
  if (currentUserPlayer?.full_name) {
    return currentUserPlayer.full_name.trim().charAt(0).toUpperCase();
  }
  return '?';
};

interface MatchHistoryRecord {
  Date?: string;
  Result?: string;
  session_status?: string;
  elo_after?: number | null;
  league_id?: number | string | null;
  season_id?: number | string | null;
  session_code?: string | null;
}

interface HomeTabProps {
  currentUserPlayer: Player | null;
  userLeagues: League[];
  onTabChange: (tab: string) => void;
  onLeaguesUpdate: () => void | Promise<void>;
}

export default function HomeTab({ currentUserPlayer, userLeagues, onTabChange, onLeaguesUpdate }: HomeTabProps) {
  const router = useRouter();
  const [userMatches, setUserMatches] = useState<MatchHistoryRecord[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [sessionsRefreshTrigger, setSessionsRefreshTrigger] = useState(0);

  // Refresh sessions when page becomes visible (e.g., returning from session page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setSessionsRefreshTrigger((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
            const dateA = a.Date ? new Date(a.Date as string).getTime() : 0;
            const dateB = b.Date ? new Date(b.Date as string).getTime() : 0;
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

  const navigateToLeague = (leagueId: number) => {
    router.push(`/league/${leagueId}`);
  };

  const handleMatchClick = (match: MatchHistoryRecord) => {
    const sessionCode = match?.session_code;
    if (sessionCode) {
      router.push(`/session/${sessionCode}`);
      return;
    }
    const leagueId = match.league_id;
    if (leagueId) {
      const params = new URLSearchParams();
      params.set('tab', 'matches');
      const seasonId = match.season_id;
      if (seasonId) {
        params.set('season', seasonId.toString());
      }
      router.push(`/league/${leagueId}?${params.toString()}`);
    }
  };

  const avatarInitial = getAvatarInitial(currentUserPlayer);
  const fullName = currentUserPlayer?.full_name || 'Player';

  // Calculate stats from match history (memoized)
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
      const sessionStatus = match.session_status;
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
      if (mostRecentMatch.elo_after !== undefined && mostRecentMatch.elo_after !== null) {
        currentRating = mostRecentMatch.elo_after;
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

  const { totalGames, currentRating, games30Days, winRate30Days } = useMemo(
    calculateStatsFromMatches,
    [userMatches, currentUserPlayer]
  );

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
            {isImageUrl(currentUserPlayer?.profile_picture_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentUserPlayer?.profile_picture_url ?? undefined}
                alt={fullName}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              avatarInitial
            )}
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

      {/* Stats Row — clickable cards navigate to My Stats */}
      <div className="home-stats-row">
        {[
          { icon: Target, label: 'Total Games Played', value: totalGames },
          { icon: TrendingUp, label: 'Rating', value: totalGames === 0 && currentRating === 0 ? '\u2014' : Math.round(currentRating) },
          { icon: Target, label: 'Games Played (Last 30 days)', value: games30Days },
          { icon: Award, label: 'Win Rate (Last 30 days)', value: games30Days > 0 ? `${winRate30Days}%` : '\u2014' },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="home-stat-card home-stat-card--clickable"
            role="button"
            tabIndex={0}
            onClick={() => onTabChange('my-stats')}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabChange('my-stats'); } }}
          >
            <Icon size={24} className="home-stat-icon" />
            <div className="home-stat-label">{label}</div>
            <div className="home-stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* My Leagues — full-width horizontal bar */}
      <MyLeaguesBar
        leagues={userLeagues}
        onLeagueClick={navigateToLeague}
        onLeaguesUpdate={onLeaguesUpdate}
        onViewAll={() => onTabChange('leagues')}
      />

      {/* Sessions + Games — 2-col grid */}
      <div className="home-content-grid">
        <MySessionsWidget
          currentUserPlayerId={currentUserPlayer?.id}
          refreshTrigger={sessionsRefreshTrigger}
          onViewAll={() => onTabChange('my-games')}
        />
        <MyMatchesWidget
          matches={userMatches}
          currentUserPlayer={currentUserPlayer}
          onMatchClick={handleMatchClick}
          onViewAll={() => onTabChange('my-games')}
        />
      </div>

      {/* Near You discovery section */}
      <NearYouSection currentUserPlayer={currentUserPlayer} onTabChange={onTabChange} />
    </div>
  );
}
