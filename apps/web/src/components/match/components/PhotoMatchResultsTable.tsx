'use client';

import { Loader2 } from 'lucide-react';

interface ExtractedPlayer {
  id?: number;
  name?: string;
}

type PlayerFieldName = 'team1_player1' | 'team1_player2' | 'team2_player1' | 'team2_player2';

interface ExtractedMatch {
  team1_player1?: ExtractedPlayer | string | null;
  team1_player2?: ExtractedPlayer | string | null;
  team2_player1?: ExtractedPlayer | string | null;
  team2_player2?: ExtractedPlayer | string | null;
  team1_player1_matched?: string | null;
  team1_player2_matched?: string | null;
  team2_player1_matched?: string | null;
  team2_player2_matched?: string | null;
  team1_player1_id?: number | null;
  team1_player2_id?: number | null;
  team2_player1_id?: number | null;
  team2_player2_id?: number | null;
  team1_score?: number | null;
  team2_score?: number | null;
  [key: string]: unknown;
}

/**
 * Presentational table of extracted match results (streamed or final).
 */
interface PhotoMatchResultsTableProps {
  matches: ExtractedMatch[];
  isProcessing: boolean;
}

export default function PhotoMatchResultsTable({ matches, isProcessing }: PhotoMatchResultsTableProps) {
  if (!matches?.length) return null;

  const getPlayerName = (match: ExtractedMatch, fieldName: PlayerFieldName): string => {
    const matchedName = match[`${fieldName}_matched`] as string | null | undefined;
    if (matchedName) return matchedName;

    const player = match[fieldName] as ExtractedPlayer | string | null | undefined;
    if (!player) return isProcessing ? '…' : 'Unknown';
    if (typeof player === 'string') return player || (isProcessing ? '…' : 'Unknown');
    if (typeof player === 'object' && player.name) return player.name;
    return isProcessing ? '…' : 'Unknown';
  };

  const isMatched = (match: ExtractedMatch, fieldName: PlayerFieldName): boolean => {
    if (match[`${fieldName}_id`]) return true;
    const player = match[fieldName] as ExtractedPlayer | string | null | undefined;
    if (!player) return false;
    if (typeof player === 'object' && player.id) return true;
    return false;
  };

  return (
    <div className="review-results">
      {isProcessing && (
        <p className="processing-hint" style={{ marginBottom: '8px' }}>
          <Loader2
            size={14}
            style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '6px' }}
          />
          Extracting games...
        </p>
      )}
      <h3>Extracted Games ({matches.length})</h3>
      <div className="matches-table-container">
        <table className="matches-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team 1</th>
              <th>Score</th>
              <th>Team 2</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, idx) => (
              <tr key={idx}>
                <td className="match-num">{idx + 1}</td>
                <td
                  className={
                    !isMatched(match, 'team1_player1') || !isMatched(match, 'team1_player2')
                      ? 'unmatched'
                      : ''
                  }
                >
                  <div className="player-names">
                    <span
                      className={!isMatched(match, 'team1_player1') ? 'player-unmatched' : ''}
                    >
                      {getPlayerName(match, 'team1_player1')}
                    </span>
                    <span
                      className={!isMatched(match, 'team1_player2') ? 'player-unmatched' : ''}
                    >
                      {getPlayerName(match, 'team1_player2')}
                    </span>
                  </div>
                </td>
                <td
                  className={`score ${match.team1_score == null ? 'score-unclear' : ''}`}
                >
                  {match.team1_score ?? '?'}
                </td>
                <td
                  className={
                    !isMatched(match, 'team2_player1') || !isMatched(match, 'team2_player2')
                      ? 'unmatched'
                      : ''
                  }
                >
                  <div className="player-names">
                    <span
                      className={!isMatched(match, 'team2_player1') ? 'player-unmatched' : ''}
                    >
                      {getPlayerName(match, 'team2_player1')}
                    </span>
                    <span
                      className={!isMatched(match, 'team2_player2') ? 'player-unmatched' : ''}
                    >
                      {getPlayerName(match, 'team2_player2')}
                    </span>
                  </div>
                </td>
                <td
                  className={`score ${match.team2_score == null ? 'score-unclear' : ''}`}
                >
                  {match.team2_score ?? '?'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
