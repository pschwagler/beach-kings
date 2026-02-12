'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthModal } from '../../../src/contexts/AuthModalContext';
import { Button } from '../../../src/components/ui/UI';
import LevelBadge from '../../../src/components/ui/LevelBadge';
import './PublicLeaguePage.css';

/** Max matches shown before "Show more" is required. */
const INITIAL_MATCH_LIMIT = 10;

/**
 * Maps raw gender values to user-friendly display labels.
 */
function formatGender(gender) {
  const map = { male: "Men's", female: "Women's", coed: 'Co-ed' };
  return map[gender?.toLowerCase()] || gender;
}

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
  const handleSignUp = () => openAuthModal('sign-up');

  const locationLabel = league.location?.name || null;

  // Private leagues get a limited view
  if (!league.is_public) {
    return (
      <div className="public-league">
        <div className="public-league__header">
          <h1 className="public-league__name">{league.name}</h1>
          <LeagueMeta league={league} />
          {locationLabel && (
            <Link href={`/find-leagues?location_id=${league.location.id}`} className="public-league__area-link">
              View all leagues in {locationLabel}
            </Link>
          )}
        </div>
        <div className="public-league__private-notice">
          <p>This is a private league with {league.member_count} members and {league.games_played || 0} games played.</p>
          <div className="public-league__cta-buttons">
            <Button onClick={handleSignIn}>Log In</Button>
            <Button variant="outline" onClick={handleSignUp}>Sign Up</Button>
          </div>
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
        {locationLabel && (
          <Link href={`/find-leagues?location_id=${league.location.id}`} className="public-league__area-link">
            View all leagues in {locationLabel}
          </Link>
        )}
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
        <div className="public-league__cta-buttons">
          <Button onClick={handleSignIn}>Log In</Button>
          <Button variant="outline" onClick={handleSignUp}>Sign Up</Button>
        </div>
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
        <span className="public-league__badge">{formatGender(league.gender)}</span>
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
              <td>{Math.round(row.points)}</td>
              <td>{Math.round((row.win_rate || 0) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Formats an ISO date string into a readable label (e.g. "Feb 10, 2026").
 */
function formatMatchDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Groups matches by date and returns an array of { date, label, matches } objects.
 */
function groupMatchesByDate(matches) {
  const groups = [];
  let currentDate = null;
  for (const match of matches) {
    const dateKey = match.date || 'unknown';
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      groups.push({ date: dateKey, label: formatMatchDate(dateKey), matches: [] });
    }
    groups[groups.length - 1].matches.push(match);
  }
  return groups;
}

/**
 * List of recent match results, grouped by date with a "Show more" toggle.
 */
function MatchList({ matches }) {
  const [expanded, setExpanded] = useState(false);
  const visibleMatches = expanded ? matches : matches.slice(0, INITIAL_MATCH_LIMIT);
  const hasMore = matches.length > INITIAL_MATCH_LIMIT;
  const groups = groupMatchesByDate(visibleMatches);

  return (
    <div className="public-league__matches">
      {groups.map((group) => (
        <div key={group.date} className="public-league__match-group">
          {group.label && (
            <div className="public-league__match-date">{group.label}</div>
          )}
          {group.matches.map((match) => (
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
      ))}
      {hasMore && (
        <button
          className="public-league__show-more"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show fewer' : `Show all ${matches.length} matches`}
        </button>
      )}
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
