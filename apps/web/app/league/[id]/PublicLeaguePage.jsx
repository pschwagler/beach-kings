'use client';

import { useAuthModal } from '../../../src/contexts/AuthModalContext';
import LevelBadge from '../../../src/components/ui/LevelBadge';
import './PublicLeaguePage.css';

/**
 * Public league view for unauthenticated users.
 * Shows league info, members, standings, and recent matches.
 * Private leagues show limited info with a sign-in CTA.
 */
export default function PublicLeaguePage({ league, leagueId }) {
  const { openAuthModal } = useAuthModal();

  if (!league) {
    return (
      <div className="public-league-empty">
        <h1>League Not Found</h1>
        <p>This league doesn&apos;t exist or couldn&apos;t be loaded.</p>
      </div>
    );
  }

  const handleSignIn = () => openAuthModal('sign-in');

  // Private leagues get a limited view
  if (!league.is_public) {
    return (
      <div className="public-league">
        <div className="public-league__header">
          <h1 className="public-league__name">{league.name}</h1>
          <LeagueMeta league={league} />
        </div>
        <div className="public-league__private-notice">
          <p>This is a private league with {league.member_count} members and {league.games_played || 0} games played.</p>
          <button className="public-league__cta" onClick={handleSignIn}>
            Sign in to see more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-league">
      <div className="public-league__header">
        <h1 className="public-league__name">{league.name}</h1>
        <LeagueMeta league={league} />
        {league.description && (
          <p className="public-league__description">{league.description}</p>
        )}
      </div>

      <div className="public-league__cta-bar">
        <button className="public-league__cta" onClick={handleSignIn}>
          Sign in to join this league
        </button>
      </div>

      {league.standings?.length > 0 && (
        <section className="public-league__section">
          <h2 className="public-league__section-title">
            {league.current_season?.name || 'Current Season'} Standings
          </h2>
          <StandingsTable standings={league.standings} />
        </section>
      )}

      {league.recent_matches?.length > 0 && (
        <section className="public-league__section">
          <h2 className="public-league__section-title">Recent Matches</h2>
          <MatchList matches={league.recent_matches} />
        </section>
      )}

      {league.members?.length > 0 && (
        <section className="public-league__section">
          <h2 className="public-league__section-title">
            Members ({league.member_count})
          </h2>
          <MemberGrid members={league.members} />
        </section>
      )}

      <div className="public-league__footer">
        <p>Want to track your stats and join leagues?</p>
        <button className="public-league__cta" onClick={handleSignIn}>
          Sign up for Beach League Volleyball
        </button>
      </div>
    </div>
  );
}

/**
 * League metadata line: location, gender, level badges.
 */
function LeagueMeta({ league }) {
  return (
    <div className="public-league__meta">
      {league.location && (
        <span className="public-league__location">
          {league.location.city}, {league.location.state}
        </span>
      )}
      {league.gender && (
        <span className="public-league__badge">{league.gender}</span>
      )}
      {league.level && <LevelBadge level={league.level} />}
      {league.member_count > 0 && (
        <span className="public-league__badge">
          {league.member_count} members
        </span>
      )}
    </div>
  );
}

/**
 * Standings table showing rank, name, record, points, win rate.
 */
function StandingsTable({ standings }) {
  return (
    <div className="public-league__table-wrapper">
      <table className="public-league__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>W</th>
            <th>L</th>
            <th>Pts</th>
            <th>Win %</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.player_id}>
              <td>{row.rank}</td>
              <td className="public-league__player-name">{row.full_name}</td>
              <td>{row.wins}</td>
              <td>{row.games - row.wins}</td>
              <td>{row.points}</td>
              <td>{Math.round((row.win_rate || 0) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * List of recent match results.
 */
function MatchList({ matches }) {
  return (
    <div className="public-league__matches">
      {matches.map((match) => (
        <div key={match.id} className="public-league__match">
          <div className={`public-league__team ${match.winner === 'team1' ? 'public-league__team--winner' : ''}`}>
            <span className="public-league__team-names">
              {match.team1_player1} &amp; {match.team1_player2}
            </span>
            <span className="public-league__team-score">{match.team1_score}</span>
          </div>
          <div className="public-league__match-vs">vs</div>
          <div className={`public-league__team ${match.winner === 'team2' ? 'public-league__team--winner' : ''}`}>
            <span className="public-league__team-names">
              {match.team2_player1} &amp; {match.team2_player2}
            </span>
            <span className="public-league__team-score">{match.team2_score}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Grid of member avatars and names.
 */
function MemberGrid({ members }) {
  return (
    <div className="public-league__members">
      {members.map((member) => (
        <div key={member.player_id} className="public-league__member">
          <div className="public-league__avatar">{member.avatar}</div>
          <span className="public-league__member-name">{member.full_name}</span>
          {member.level && <LevelBadge level={member.level} />}
        </div>
      ))}
    </div>
  );
}
