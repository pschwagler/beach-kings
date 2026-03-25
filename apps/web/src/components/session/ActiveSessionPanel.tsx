import { Trophy, Users, ChevronDown, MapPin } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import type { Match, Season } from '../../types';
import type { DisplayMatch } from '../league/utils/matchUtils';

interface Court {
  id: number;
  name: string;
  slug?: string | null;
}

export interface ActiveSession {
  id: number;
  name?: string | null;
  status?: string | null;
  season_id?: number | null;
  court_id?: number | null;
  court_name?: string | null;
  court_slug?: string | null;
}

interface ActiveSessionPanelProps {
  activeSession: ActiveSession;
  activeSessionMatches: DisplayMatch[];
  onPlayerClick?: (playerId: number | null, playerName: string, e: React.MouseEvent) => void;
  onAddMatchClick?: () => void;
  onEditMatch?: (match: Match) => void;
  onSubmitClick?: () => void;
  onSaveClick?: () => void;
  onCancelClick?: () => void;
  onDeleteSession?: () => void;
  onRequestDeleteSession?: () => void;
  onRequestLeaveSession?: () => void;
  onUpdateSessionSeason?: ((sessionId: number, seasonId: number) => void) | null;
  onUpdateSessionCourt?: ((sessionId: number, courtId: number | null) => void) | null;
  onStatsClick?: () => void;
  isEditing?: boolean;
  seasons?: Season[];
  selectedSeasonId?: number | null;
  contentVariant?: string;
  isAdmin?: boolean;
  variant?: 'league' | 'non-league' | null;
  isSubmitted?: boolean;
  submittedTimestampText?: string | null;
  onEditSessionClick?: (() => void) | null;
  leagueHomeCourts?: Court[];
  leagueLocationId?: string | null;
}
import Link from 'next/link';
import MatchCard from '../match/MatchCard';
import SessionMatchesClipboardTable from '../match/SessionMatchesClipboardTable';
import SessionHeader from './SessionHeader';
import SessionGroupHeader from './SessionGroupHeader';
import SessionActions from './SessionActions';
import CourtSelector from '../court/CourtSelector';
import { formatDateRange } from '../league/utils/leagueUtils';
import { useClickOutside } from '../../hooks/useClickOutside';
import { getUniquePlayersCount } from '../league/utils/matchUtils';

export default function ActiveSessionPanel({
  activeSession,
  activeSessionMatches,
  onPlayerClick,
  onAddMatchClick,
  onEditMatch,
  onSubmitClick,
  onSaveClick,
  onCancelClick,
  onDeleteSession,
  onRequestDeleteSession,
  onRequestLeaveSession,
  onUpdateSessionSeason,
  onUpdateSessionCourt,
  onStatsClick,
  isEditing = false,
  seasons = [],
  selectedSeasonId = null,
  contentVariant = 'cards',
  isAdmin = false,
  variant = null,
  isSubmitted = false,
  submittedTimestampText = null,
  onEditSessionClick = null,
  leagueHomeCourts = [],
  leagueLocationId = null,
}: ActiveSessionPanelProps) {
  const gameCount = activeSessionMatches.length;
  const playerCount = getUniquePlayersCount(activeSessionMatches);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);

  // Get the season for this session (league only; non-league has no season_id)
  const sessionSeasonId = activeSession?.season_id ?? null;
  const isLeague = variant === 'league' || (variant !== 'non-league' && sessionSeasonId != null);
  const sessionSeason = sessionSeasonId ? seasons.find(s => s.id === sessionSeasonId) : null;

  useClickOutside(seasonDropdownRef, isSeasonDropdownOpen, () => setIsSeasonDropdownOpen(false));

  const showSubmittedHeader = isSubmitted && !isEditing;

  return (
    <div className="active-session-panel" data-testid="active-session-panel">
      {showSubmittedHeader ? (
        <SessionGroupHeader
          sessionName={activeSession.name}
          gameCount={gameCount}
          playerCount={playerCount}
          onStatsClick={onStatsClick}
          onEditClick={onEditSessionClick ?? undefined}
          timestampText={submittedTimestampText ?? undefined}
          seasonBadge={sessionSeason ? (sessionSeason.name || `Season ${sessionSeason.id}`) : undefined}
        />
      ) : (
        <SessionHeader
          sessionName={activeSession.name}
          gameCount={gameCount}
          playerCount={playerCount}
          onStatsClick={onStatsClick}
          onRequestDelete={isAdmin && onRequestDeleteSession ? onRequestDeleteSession : undefined}
          onRequestLeave={!isAdmin && onRequestLeaveSession ? onRequestLeaveSession : undefined}
          isEditing={isEditing}
        />
      )}

      {/* Season selector row (league only) */}
      {isLeague && sessionSeasonId ? (
        <div className="session-season-row">
          <div className="session-season-selector">
              <span className="session-season-label">Season:</span>
              <div className="season-dropdown-wrapper" ref={seasonDropdownRef}>
                {sessionSeason ? (
                  <>
                    <div
                      className="season-dropdown-trigger"
                      onClick={() => setIsSeasonDropdownOpen(!isSeasonDropdownOpen)}
                    >
                      <span className="season-name">{sessionSeason.name || `Season ${sessionSeason.id}`}</span>
                      {sessionSeason.start_date && sessionSeason.end_date && (
                        <span className="season-dates">
                          {formatDateRange(sessionSeason.start_date, sessionSeason.end_date)}
                        </span>
                      )}
                      <ChevronDown size={14} className={isSeasonDropdownOpen ? 'rotate-180' : ''} />
                    </div>
                    {isSeasonDropdownOpen && seasons.length > 1 && (
                      <div className="season-dropdown-menu">
                        {seasons.map((season) => (
                          <div
                            key={season.id}
                            className={`season-dropdown-option ${sessionSeasonId === season.id ? 'selected' : ''}`}
                            onClick={async () => {
                              if (sessionSeasonId !== season.id && onUpdateSessionSeason) {
                                try {
                                  await onUpdateSessionSeason(activeSession.id, season.id);
                                  setIsSeasonDropdownOpen(false);
                                } catch (error) {
                                  console.error('Error updating session season:', error);
                                }
                              } else {
                                setIsSeasonDropdownOpen(false);
                              }
                            }}
                          >
                            <span className="season-name">
                              {season.name || `Season ${season.id}`}
                            </span>
                            {season.start_date && season.end_date && (
                              <span className="season-dates">
                                {formatDateRange(season.start_date, season.end_date)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="season-id-text">
                    Season {sessionSeasonId}
                  </span>
                )}
              </div>
            </div>
        </div>
      ) : null}

      {/* Court row (league sessions only — pickup uses Manage Session drawer) */}
      {isLeague && activeSession?.court_name && !isAdmin && (
        <div className="session-court-row">
          <MapPin size={14} />
          {activeSession.court_slug && !activeSession.court_slug.startsWith('other-private-') ? (
            <Link href={`/courts/${activeSession.court_slug}`} className="session-court-link">
              {activeSession.court_name}
            </Link>
          ) : (
            <span>{activeSession.court_name}</span>
          )}
        </div>
      )}
      {isLeague && isAdmin && onUpdateSessionCourt && (
        <div className="session-court-row session-court-row--editable">
          <CourtSelector
            value={activeSession?.court_id ?? null}
            valueName={activeSession?.court_name ?? null}
            onChange={(courtId) => {
              onUpdateSessionCourt(activeSession.id, courtId);
            }}
            homeCourts={leagueHomeCourts}
            preFilterLocationId={leagueLocationId}
            label="Court"
          />
        </div>
      )}

      <SessionActions
        onAddMatchClick={onAddMatchClick}
        onSubmitClick={onSubmitClick}
        onSaveClick={onSaveClick}
        onCancelClick={onCancelClick}
        isEditing={isEditing}
      />

      <div className="session-matches-section">
        <div className="session-matches-label">
          Session Games
        </div>
        {activeSessionMatches.length === 0 && contentVariant === 'cards' ? (
          <div className="session-empty-state">
            <Trophy size={40} className="session-empty-icon" />
            <div className="session-empty-text">
              No matches recorded. Start by adding your first match!
            </div>
          </div>
        ) : contentVariant === 'clipboard' ? (
          <SessionMatchesClipboardTable
            matches={activeSessionMatches}
            onPlayerClick={onPlayerClick}
            onEditMatch={onEditMatch}
            canAddMatch={Boolean(onAddMatchClick)}
            onAddMatch={onAddMatchClick ? () => onAddMatchClick() : undefined}
            sessionId={activeSession?.id}
            seasonId={sessionSeasonId}
            showActions={Boolean(onEditMatch)}
          />
        ) : (
          <div className="match-cards">
            {activeSessionMatches.map((match, idx) => (
              <MatchCard
                key={idx}
                match={match}
                onPlayerClick={onPlayerClick}
                onEdit={onEditMatch}
                showEdit={Boolean(onEditMatch)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
