import type { GameHistoryEntry } from '@beach-kings/shared';
import { groupHistorySessions, historySessionDate } from '@/features/matches/historyPresentation';

const game = (id: number, sessionId: number, date: string | null): GameHistoryEntry => ({
  id, session_id: sessionId, session_date: date, league_id: null, league_name: null,
  court_label: null, result: 'W', my_score: 21, opponent_score: 18,
  partner_names: [], partner_ids: [], opponent_names: [], opponent_ids: [],
  rating_change: null, session_submitted: true, rating_pending_reason: 'calculation',
});

it('groups non-adjacent games by session while preserving source order and input', () => {
  const games = Object.freeze([game(1, 10, null), game(2, 11, '2026-10-19'), game(3, 10, '2026-10-18')]);
  expect(groupHistorySessions(games)).toEqual([
    { sessionId: 10, date: '2026-10-18', games: [games[0], games[2]] },
    { sessionId: 11, date: '2026-10-19', games: [games[1]] },
  ]);
  expect(games.map((entry) => entry.id)).toEqual([1, 2, 3]);
});

it('formats calendar dates without shifting back a day in western time zones', () => {
  expect(historySessionDate('2026-10-19')).toBe('Oct 19, 2026');
  expect(historySessionDate('2024-02-29')).toBe('Feb 29, 2024');
});

it.each([null, '', 'invalid', '2026-02-30', '2026-13-01'])('does not fabricate a date for %s', (value) => {
  expect(historySessionDate(value)).toBe('Date unavailable');
});
