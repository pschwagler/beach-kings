import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { KobMatch, KobTournamentDetail } from '@beach-kings/shared';

import KobLivePanel from '@/components/screens/Kob/KobLivePanel';
import KobSchedulePanel from '@/components/screens/Kob/KobSchedulePanel';

const COMPLETED_MATCH: KobMatch = {
  id: 10,
  matchup_id: 'round-1-court-1',
  round_num: 1,
  phase: 'pool_play',
  pool_id: null,
  court_num: 1,
  team1_player1_id: 1,
  team1_player2_id: 2,
  team2_player1_id: 3,
  team2_player2_id: 4,
  team1_player1_name: 'Alex',
  team1_player2_name: 'Bailey',
  team2_player1_name: 'Casey',
  team2_player2_name: 'Devon',
  team1_score: 28,
  team2_score: 26,
  winner: 1,
  game_scores: null,
  bracket_position: null,
  is_bye: false,
};

const TOURNAMENT: KobTournamentDetail = {
  id: 1,
  name: 'Summer King of the Beach',
  code: 'SUMMER',
  gender: 'mens',
  format: 'FULL_ROUND_ROBIN',
  status: 'ACTIVE',
  num_courts: 1,
  game_to: 21,
  scheduled_date: '2026-07-18',
  player_count: 4,
  current_round: 1,
  created_at: '2026-07-01T00:00:00Z',
  win_by: 2,
  max_rounds: 1,
  has_playoffs: false,
  playoff_size: null,
  num_pools: 1,
  games_per_match: 1,
  num_rr_cycles: 1,
  score_cap: null,
  playoff_format: null,
  playoff_game_to: null,
  playoff_games_per_match: null,
  playoff_score_cap: null,
  is_ranked: true,
  current_phase: 'pool_play',
  auto_advance: false,
  director_player_id: null,
  director_name: null,
  league_id: null,
  location_id: null,
  schedule_data: null,
  players: [],
  matches: [COMPLETED_MATCH],
  standings: [],
  updated_at: '2026-07-18T00:00:00Z',
};

describe('KoB completed score formatting', () => {
  it('uses the compact score in the live panel', () => {
    render(<KobLivePanel tournament={TOURNAMENT} />);

    expect(screen.getByText('28-26')).toBeTruthy();
    expect(screen.queryByText('28 - 26')).toBeNull();
  });

  it('uses the compact score in the schedule panel', () => {
    render(<KobSchedulePanel tournament={TOURNAMENT} />);

    expect(screen.getByText('28-26')).toBeTruthy();
    expect(screen.queryByText('28 - 26')).toBeNull();
  });
});
