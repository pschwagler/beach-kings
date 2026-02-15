'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { Button } from '../ui/UI';
import LevelBadge from '../ui/LevelBadge';
import { formatGender } from '../../utils/formatters';
import { slugify } from '../../utils/slugify';
import './PublicLeaguePage.css';

/** Max matches shown before "Show more" is required. */
const INITIAL_MATCH_LIMIT = 10;

/**
 * Public league view for unauthenticated users or authenticated non-members.
 * Shows league info, members, standings, and recent matches.
 * Private leagues show limited info with a sign-in or join CTA.
 *
 * @param {Object} props
 * @param {Object} props.league - Public league data from the API
 * @param {string|number} props.leagueId - League ID
 * @param {Function} [props.onJoinLeague] - If provided, renders join button instead of login/signup CTAs (authenticated non-member mode)
 * @param {boolean} [props.isOpen] - Whether the league is open-join; controls "Join League" vs "Request to Join" label
 */
export default function PublicLeaguePage({ league, leagueId, onJoinLeague, isOpen }) {
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

  /** Renders either a join button (authed non-member) or login/signup CTAs (unauthenticated). */
  const renderCta = (promptText) => {
    if (onJoinLeague) {
      return (
        <div className="public-league__cta-buttons">
          <Button onClick={onJoinLeague}>
            {isOpen ? 'Join League' : 'Request to Join'}
          </Button>
        </div>
      );
    }
    return (
      <>
        {promptText && <p>{promptText}</p>}
        <div className="public-league__cta-buttons">
          <Button onClick={handleSignIn}>Log In</Button>
          <Button variant="outline" onClick={handleSignUp}>Sign Up</Button>
        </div>
      </>
    );
  };

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
          {renderCta(null)}
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

      {!onJoinLeague && (
        <div className="public-league__auth-prompt">
          <span className="public-league__auth-prompt-text">
            <button className="public-league__auth-prompt-link" onClick={handleSignIn} aria-label="Log in to Beach League">Log in</button>
            {' or '}
            <button className="public-league__auth-prompt-link" onClick={handleSignUp} aria-label="Sign up for Beach League">sign up</button>
            {' to join leagues and track your stats'}
          </span>
        </div>
      )}

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
        {renderCta('Log in or sign up to join leagues and track your stats')}
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
              <td className="public-league__player-name">
                <Link href={`/player/${row.player_id}/${slugify(row.full_name)}`} className="public-league__player-link">
                  {row.full_name}
                </Link>
              </td>
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
 * Renders a player name as a link to their profile when an ID is available.
 */
function PlayerLink({ name, playerId }) {
  if (!name) return null;
  if (!playerId) return name;
  return (
    <Link href={`/player/${playerId}/${slugify(name)}`} className="public-league__player-link">
      {name}
    </Link>
  );
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
                  <PlayerLink name={match.team1_player1} playerId={match.team1_player1_id} />
                  {' & '}
                  <PlayerLink name={match.team1_player2} playerId={match.team1_player2_id} />
                </span>
                <span className="public-league__team-score">{match.team1_score}</span>
              </div>
              <div className="public-league__match-vs">vs</div>
              <div className={`public-league__team ${match.winner === 'team2' ? 'public-league__team--winner' : ''}`}>
                <span className="public-league__team-names">
                  <PlayerLink name={match.team2_player1} playerId={match.team2_player1_id} />
                  {' & '}
                  <PlayerLink name={match.team2_player2} playerId={match.team2_player2_id} />
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
          <Link href={`/player/${member.player_id}/${slugify(member.full_name)}`} className="public-league__player-link public-league__member-name">
            {member.full_name}
          </Link>
          {member.level && <LevelBadge level={member.level} />}
        </div>
      ))}
    </div>
  );
}
