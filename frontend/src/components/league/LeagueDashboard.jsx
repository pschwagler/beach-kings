import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Users, Trophy, Plus } from 'lucide-react';
import NavBar from '../layout/NavBar';
import { Button, Alert } from '../ui/UI';
import { getLeague, getLeagueSeasons, getLeagueMembers, getUserLeagues } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function LeagueDashboard({ leagueId }) {
  const { isAuthenticated, user } = useAuth();
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [members, setMembers] = useState([]);
  const [userLeagues, setUserLeagues] = useState([]);

  // Load user leagues for the navbar
  useEffect(() => {
    if (isAuthenticated) {
      const loadLeagues = async () => {
        try {
          const leagues = await getUserLeagues();
          setUserLeagues(leagues);
        } catch (err) {
          console.error('Error loading user leagues:', err);
        }
      };
      loadLeagues();
    }
  }, [isAuthenticated]);

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'view-league' && leagueId) {
      window.history.pushState({}, '', `/league/${leagueId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  useEffect(() => {
    const loadLeagueData = async () => {
      if (!leagueId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const leagueData = await getLeague(leagueId);
        setLeague(leagueData);
        
        // Load seasons and members
        try {
          const seasonsData = await getLeagueSeasons(leagueId);
          setSeasons(seasonsData);
        } catch (err) {
          console.error('Error loading seasons:', err);
          // Don't fail the whole page if seasons fail
        }
        
        try {
          const membersData = await getLeagueMembers(leagueId);
          setMembers(membersData);
        } catch (err) {
          console.error('Error loading members:', err);
          // Don't fail the whole page if members fail
        }
      } catch (err) {
        console.error('Error loading league:', err);
        setError(err.response?.data?.detail || 'Failed to load league');
      } finally {
        setLoading(false);
      }
    };

    loadLeagueData();
  }, [leagueId]);

  const handleBack = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  if (loading) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          userLeagues={userLeagues}
          onLeaguesMenuClick={handleLeaguesMenuClick}
        />
        <div className="container">
          <div className="loading" style={{ padding: '40px', textAlign: 'center' }}>
            Loading league...
          </div>
        </div>
      </>
    );
  }

  if (error || !league) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          userLeagues={userLeagues}
          onLeaguesMenuClick={handleLeaguesMenuClick}
        />
        <div className="container">
          <div style={{ padding: '40px' }}>
            <Button onClick={handleBack} style={{ marginBottom: '20px' }}>
              <ArrowLeft size={18} />
              Back to Home
            </Button>
            <Alert type="error">
              {error || 'League not found'}
            </Alert>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        userLeagues={userLeagues}
        onLeaguesMenuClick={onLeaguesMenuClick}
      />
      <div className="container">
        <div className="league-dashboard">
          {/* Header */}
          <div className="league-header">
            <Button onClick={handleBack} variant="secondary" style={{ marginBottom: '20px' }}>
              <ArrowLeft size={18} />
              Back to Home
            </Button>
            
            <div className="league-title-section">
              <h1 className="league-title">{league.name}</h1>
              <div className="league-badges">
                {league.is_open ? (
                  <span className="league-badge open">Open</span>
                ) : (
                  <span className="league-badge invite-only">Invite Only</span>
                )}
              </div>
            </div>
            
            {league.description && (
              <p className="league-description">{league.description}</p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="league-stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <Calendar size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{seasons.length}</div>
                <div className="stat-label">Seasons</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">
                <Users size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{members.length}</div>
                <div className="stat-label">Members</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">
                <Trophy size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">-</div>
                <div className="stat-label">Active Season</div>
              </div>
            </div>
          </div>

          {/* Seasons Section */}
          <div className="league-section">
            <div className="section-header">
              <h2 className="section-title">
                <Calendar size={20} />
                Seasons
              </h2>
              <Button variant="success" size="small">
                <Plus size={16} />
                New Season
              </Button>
            </div>
            
            {seasons.length === 0 ? (
              <div className="empty-state">
                <Calendar size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                <p>No seasons yet. Create a season to start tracking matches!</p>
              </div>
            ) : (
              <div className="seasons-list">
                {seasons.map((season) => (
                  <div key={season.id} className="season-card">
                    <div className="season-info">
                      <h3>{season.name || `Season ${season.id}`}</h3>
                      <p className="season-dates">
                        {new Date(season.start_date).toLocaleDateString()} - {new Date(season.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    {season.is_active && (
                      <span className="season-badge active">Active</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Members Section */}
          <div className="league-section">
            <div className="section-header">
              <h2 className="section-title">
                <Users size={20} />
                Members
              </h2>
              <Button variant="success" size="small">
                <Plus size={16} />
                Invite Member
              </Button>
            </div>
            
            {members.length === 0 ? (
              <div className="empty-state">
                <Users size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                <p>No members yet. Invite players to join this league!</p>
              </div>
            ) : (
              <div className="members-list">
                {members.map((member) => (
                  <div key={member.id} className="member-card">
                    <div className="member-info">
                      <h3>{member.player_name || `Player ${member.player_id}`}</h3>
                      <p className="member-role">{member.role}</p>
                    </div>
                    {member.role === 'admin' && (
                      <span className="member-badge admin">Admin</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

