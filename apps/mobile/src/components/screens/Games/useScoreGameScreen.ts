/**
 * Data hook for the Score Game modal screen.
 *
 * Manages:
 *   - team1 and team2 player slots (up to 2 each)
 *   - score inputs for each team
 *   - roster data for the picker
 *   - submit flow with loading / error / success states
 *
 * The actual POST is behind a TODO(backend) guard in mockApi — it will throw
 * on submit so the UI can exercise its error state during development.
 */

import { useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';

export type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export interface PlayerSlot {
  readonly player_id: number | null;
  readonly display_name: string;
  readonly initials: string;
}

const EMPTY_SLOT: PlayerSlot = {
  player_id: null,
  display_name: '',
  initials: '',
};

/** Minimal roster player shape used within this hook. */
export interface RosterPlayer {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
}

/** Mock roster for picker (real endpoint not yet available). */
const MOCK_ROSTER: RosterPlayer[] = [
  { player_id: 10, display_name: 'C. Gulla', initials: 'CG' },
  { player_id: 11, display_name: 'K. Fawwar', initials: 'KF' },
  { player_id: 12, display_name: 'A. Marthey', initials: 'AM' },
  { player_id: 13, display_name: 'S. Jindash', initials: 'SJ' },
  { player_id: 14, display_name: 'R. Ballakian', initials: 'RB' },
  { player_id: 20, display_name: 'J. Drabos', initials: 'JD' },
  { player_id: 21, display_name: 'M. Salizar', initials: 'MS' },
  { player_id: 22, display_name: 'D. Miniucali', initials: 'DM' },
];

export interface UseScoreGameScreenResult {
  readonly team1: readonly [PlayerSlot, PlayerSlot];
  readonly team2: readonly [PlayerSlot, PlayerSlot];
  readonly score1: number;
  readonly score2: number;
  readonly roster: readonly RosterPlayer[];
  readonly search: string;
  readonly filteredRoster: readonly RosterPlayer[];
  readonly submitState: SubmitState;
  readonly errorMessage: string | null;
  readonly canSubmit: boolean;
  readonly setScore1: (n: number) => void;
  readonly setScore2: (n: number) => void;
  readonly assignPlayer: (team: 1 | 2, slot: 0 | 1, player: RosterPlayer | null) => void;
  readonly setSearch: (q: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onDismissError: () => void;
}

export function useScoreGameScreen(): UseScoreGameScreenResult {
  const [team1, setTeam1] = useState<[PlayerSlot, PlayerSlot]>([
    EMPTY_SLOT,
    EMPTY_SLOT,
  ]);
  const [team2, setTeam2] = useState<[PlayerSlot, PlayerSlot]>([
    EMPTY_SLOT,
    EMPTY_SLOT,
  ]);
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [search, setSearch] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredRoster = useMemo(() => {
    if (search.trim() === '') return MOCK_ROSTER;
    const q = search.toLowerCase();
    return MOCK_ROSTER.filter((p) =>
      p.display_name.toLowerCase().includes(q),
    );
  }, [search]);

  const assignPlayer = useCallback(
    (team: 1 | 2, slot: 0 | 1, player: RosterPlayer | null) => {
      const newSlot: PlayerSlot = player != null
        ? { player_id: player.player_id, display_name: player.display_name, initials: player.initials }
        : EMPTY_SLOT;

      if (team === 1) {
        setTeam1((prev) => {
          const next: [PlayerSlot, PlayerSlot] = [prev[0], prev[1]];
          next[slot] = newSlot;
          return next;
        });
      } else {
        setTeam2((prev) => {
          const next: [PlayerSlot, PlayerSlot] = [prev[0], prev[1]];
          next[slot] = newSlot;
          return next;
        });
      }
    },
    [],
  );

  const canSubmit =
    team1[0].player_id != null &&
    team1[1].player_id != null &&
    team2[0].player_id != null &&
    team2[1].player_id != null &&
    (score1 > 0 || score2 > 0);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitState('loading');
    setErrorMessage(null);
    try {
      await api.submitScoredGame({
        team1_player1_id: team1[0].player_id!,
        team1_player2_id: team1[1].player_id!,
        team2_player1_id: team2[0].player_id!,
        team2_player2_id: team2[1].player_id!,
        team1_score: score1,
        team2_score: score2,
        is_ranked: true,
      });
      setSubmitState('success');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error occurred.';
      setErrorMessage(message);
      setSubmitState('error');
    }
  }, [canSubmit, team1, team2, score1, score2]);

  const onRetry = useCallback(() => {
    setSubmitState('idle');
    setErrorMessage(null);
  }, []);

  const onDismissError = useCallback(() => {
    setSubmitState('idle');
    setErrorMessage(null);
  }, []);

  return {
    team1,
    team2,
    score1,
    score2,
    roster: MOCK_ROSTER,
    search,
    filteredRoster,
    submitState,
    errorMessage,
    canSubmit,
    setScore1,
    setScore2,
    assignPlayer,
    setSearch,
    onSubmit: () => { void onSubmit(); },
    onRetry,
    onDismissError,
  };
}
