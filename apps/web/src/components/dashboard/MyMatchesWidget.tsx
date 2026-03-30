import React, { useState } from 'react';
import type { Player } from '../../types';
import { Calendar, Trophy } from 'lucide-react';
import { formatDate } from '../../utils/dateUtils';
import ShareInviteIcon from '../player/ShareInviteIcon';

/** Shape of one match history record returned by the player match history API. */
export interface MatchRecord {
  Result?: string;
  Score?: string;
  Date?: string;
  Partner?: string;
  partner_id?: number | null;
  partner_is_placeholder?: boolean;
  'Opponent 1'?: string;
  opponent_1_id?: number | null;
  'Opponent 1 IsPlaceholder'?: boolean;
  'Opponent 2'?: string;
  opponent_2_id?: number | null;
  'Opponent 2 IsPlaceholder'?: boolean;
  league_name?: string;
  league_id?: number | string | null;
  'League ID'?: number | string | null;
  court_name?: string;
  session_code?: string | null;
  'Session Code'?: string | null;
  session_status?: string;
  'Season ID'?: number | string | null;
  season_id?: number | string | null;
}

/**
 * Displays user's match history.
 * variant="widget" (default): dashboard card with 5-item limit, expand footer, widget chrome.
 * variant="full": bare list — no card wrapper, no limit, all items flow on page.
 */
interface MyMatchesWidgetProps {
  matches: MatchRecord[] | null;
  currentUserPlayer?: Player | null;
  onMatchClick?: (match: MatchRecord) => void;
  onViewAll?: () => void;
  variant?: 'widget' | 'full';
}

export default function MyMatchesWidget({ matches, currentUserPlayer, onMatchClick, onViewAll, variant = 'widget' }: MyMatchesWidgetProps) {
  const [showAll, setShowAll] = useState(false);
  const isFull = variant === 'full';

  const titleElement = onViewAll ? (
    <h3
      className="dashboard-widget-title dashboard-widget-title--clickable"
      onClick={onViewAll}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewAll(); } }}
    >
      My Games
    </h3>
  ) : (
    <h3 className={isFull ? 'my-games-tab-section-title' : 'dashboard-widget-title'}>My Games</h3>
  );

  const getMatchResult = (match: MatchRecord) => {
    const won = match.Result === 'W';
    const score = match.Score || '0-0';

    return {
      won,
      score,
      partner: match.Partner || 'Solo',
      partnerId: match.partner_id,
      partnerIsPlaceholder: match.partner_is_placeholder,
      opponent1: match['Opponent 1'],
      opponent1Id: match.opponent_1_id,
      opponent1IsPlaceholder: match['Opponent 1 IsPlaceholder'],
      opponent2: match['Opponent 2'],
      opponent2Id: match.opponent_2_id,
      opponent2IsPlaceholder: match['Opponent 2 IsPlaceholder'],
      leagueName: match.league_name,
      courtName: match.court_name,
    };
  };

  const renderEmpty = () => (
    <div className="dashboard-empty-state">
      <Trophy size={40} className="empty-state-icon" />
      <p>No games found</p>
      <p className="empty-state-text">Your recent games will appear here</p>
    </div>
  );

  const displayMatches = isFull ? matches : (showAll ? matches : (matches || []).slice(0, 5));

  const renderMatchList = () => (
    <div className={`dashboard-matches-list${!isFull && showAll ? ' dashboard-matches-list-expanded' : ''}`}>
      {(displayMatches || []).map((match, idx) => {
        const result = getMatchResult(match);
        const isClickable = onMatchClick && (match.league_id || match.session_code);

        const handleClick = () => {
          if (isClickable) {
            onMatchClick(match);
          }
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onMatchClick(match);
          }
        };

        return (
          <div
            key={idx}
            className={`dashboard-match-item ${isClickable ? 'dashboard-match-item-clickable' : ''}`}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            aria-label={isClickable ? `View game: ${result.score} with ${result.partner} vs ${[result.opponent1, result.opponent2].filter(Boolean).join(' & ')}` : undefined}
          >
            <div className="dashboard-match-result">
              <span className={`dashboard-match-status ${result.won ? 'won' : 'lost'}`}>
                {match.Result || '?'}
              </span>
              <div className="dashboard-match-details">
                <span className="dashboard-match-score">{result.score}</span>
                <span className="dashboard-match-partner">
                  w/ {result.partner}
                  {result.partnerIsPlaceholder && <ShareInviteIcon playerId={Number(result.partnerId)} playerName={result.partner ?? ''} />}
                </span>
                <span className="dashboard-match-opponent">
                  vs {result.opponent1}
                  {result.opponent1IsPlaceholder && <ShareInviteIcon playerId={Number(result.opponent1Id)} playerName={result.opponent1 ?? ''} />}
                  {result.opponent2 && (
                    <>
                      {' & '}{result.opponent2}
                      {result.opponent2IsPlaceholder && <ShareInviteIcon playerId={Number(result.opponent2Id)} playerName={result.opponent2} />}
                    </>
                  )}
                </span>
                {result.leagueName && (
                  <span className="dashboard-match-league">{result.leagueName}</span>
                )}
              </div>
            </div>
            <div className="dashboard-match-right">
              {match.Date && (
                <span className="dashboard-match-date">
                  {formatDate(match.Date)}
                </span>
              )}
              {result.courtName && (
                <span className="dashboard-match-court">{result.courtName}</span>
              )}
            </div>
          </div>
        );
      })}
      {!isFull && matches && matches.length > 5 && (
        <div
          className="dashboard-widget-footer dashboard-widget-footer-clickable"
          onClick={() => setShowAll(!showAll)}
        >
          <p className="secondary-text">
            {showAll
              ? 'Show less'
              : `+${matches.length - 5} more game${matches.length - 5 !== 1 ? 's' : ''}`
            }
          </p>
        </div>
      )}
    </div>
  );

  // Full variant — bare list, no widget chrome
  if (isFull) {
    return (
      <div>
        {titleElement}
        {(!matches || matches.length === 0) ? renderEmpty() : renderMatchList()}
      </div>
    );
  }

  // Widget variant — card with header
  if (!matches || matches.length === 0) {
    return (
      <div className="dashboard-widget">
        <div className="dashboard-widget-header">
          <div className="dashboard-widget-header-title">
            <Calendar size={20} />
            {titleElement}
          </div>
        </div>
        <div className="dashboard-widget-content">
          {renderEmpty()}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-widget">
      <div className="dashboard-widget-header">
        <div className="dashboard-widget-header-title">
          <Calendar size={20} />
          {titleElement}
        </div>
      </div>
      <div className="dashboard-widget-content">
        {renderMatchList()}
      </div>
    </div>
  );
}
