import { useCallback } from 'react';

/** A player option as produced by usePlayerMappings or the form reducer. */
type PlayerOption = { value: number | string; label?: string; [key: string]: unknown } | string | null;

/** Form data for the match form. */
interface MatchFormData {
  team1Player1?: PlayerOption;
  team1Player2?: PlayerOption;
  team2Player1?: PlayerOption;
  team2Player2?: PlayerOption;
  team1Score?: string;
  team2Score?: string;
}

/** Score validation result from useMatchValidation.validateForm(). */
interface ScoresValidation {
  score1?: number;
  score2?: number;
}

/** A minimal season shape used for fallback season selection. */
interface SeasonOption {
  id: number;
  start_date?: string | null;
  end_date?: string | null;
}

/**
 * Hook to build match payload from form data
 * Handles all the complex logic for building the match payload
 */
interface UseMatchPayloadParams {
  matchType: string;
  selectedLeagueId: number | null | undefined;
  selectedSeasonId: number | null | undefined;
  allSeasons: SeasonOption[];
  sessionId: number | null | undefined;
  isRanked: boolean;
  getPlayerId: (playerOption: PlayerOption) => number | string | null;
  formData: MatchFormData;
}

export function useMatchPayload({
  matchType,
  selectedLeagueId,
  selectedSeasonId,
  allSeasons,
  sessionId,
  isRanked,
  getPlayerId,
  formData
}: UseMatchPayloadParams) {
  const buildMatchPayload = useCallback((scoresValidation: ScoresValidation) => {
    // Extract player IDs from form data
    const team1_p1_id = getPlayerId(formData.team1Player1);
    const team1_p2_id = getPlayerId(formData.team1Player2);
    const team2_p1_id = getPlayerId(formData.team2Player1);
    const team2_p2_id = getPlayerId(formData.team2Player2);

    // Build base payload
    const matchPayload: Record<string, number | string | boolean | null | undefined> = {
      team1_player1_id: team1_p1_id,
      team1_player2_id: team1_p2_id,
      team2_player1_id: team2_p1_id,
      team2_player2_id: team2_p2_id,
      team1_score: scoresValidation.score1,
      team2_score: scoresValidation.score2,
      is_ranked: isRanked
    };

    // Add league_id and season_id for league matches
    if (matchType === 'league' && selectedLeagueId) {
      matchPayload.league_id = selectedLeagueId;
      
      // Determine season_id with fallback logic
      if (selectedSeasonId) {
        matchPayload.season_id = selectedSeasonId;
      } else if (allSeasons.length === 1) {
        // If no season selected and only one season exists, use it
        matchPayload.season_id = allSeasons[0].id;
      }
    }

    // Add session_id if provided (e.g., when adding to an existing session)
    if (sessionId) {
      matchPayload.session_id = sessionId;
    }

    return matchPayload;
  }, [
    matchType,
    selectedLeagueId,
    selectedSeasonId,
    allSeasons,
    sessionId,
    isRanked,
    getPlayerId,
    formData
  ]);

  return { buildMatchPayload };
}

