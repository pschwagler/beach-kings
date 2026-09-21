import type { SessionGame } from '@beach-kings/shared';
import { formatSessionResults } from '@/features/sessions/formatResults';

function game(overrides: Partial<SessionGame> = {}): SessionGame {
  return {
    id: 1,
    game_number: 1,
    team1_player1_id: 10,
    team1_player2_id: 20,
    team2_player1_id: 30,
    team2_player2_id: 40,
    team1_player1_name: 'Jordan Lee',
    team1_player2_name: 'Sam Kim',
    team2_player1_name: 'Alex Diaz',
    team2_player2_name: 'Morgan Wu',
    team1_score: 21,
    team2_score: 18,
    winner: 1,
    rating_change: 2.5,
    is_ranked: true,
    ...overrides,
  };
}

describe('formatSessionResults', () => {
  it('formats context, local calendar date, and every game in display order', () => {
    expect(formatSessionResults({
      contextLabel: 'Tuesday League · Session #4',
      date: '2026-09-20',
      viewerPlayerId: 10,
      games: [
        game(),
        game({
          id: 2,
          game_number: 2,
          team1_score: 19,
          team2_score: 21,
          winner: 2,
        }),
      ],
    })).toBe([
      'Tuesday League · Session #4 · Sep 20, 2026',
      'You / Sam Kim 21 – 18 Alex Diaz / Morgan Wu',
      'You / Sam Kim 19 – 21 Alex Diaz / Morgan Wu',
    ].join('\n'));
  });

  it('preserves tie and pending scores without inventing a result', () => {
    expect(formatSessionResults({
      contextLabel: 'Pickup · Session #1',
      date: '2026-09-20',
      viewerPlayerId: null,
      games: [
        game({ team1_score: 20, team2_score: 20, winner: null }),
        game({ id: 2, game_number: 2, team1_score: null, team2_score: null, winner: null }),
      ],
    })).toContain(
      'Jordan Lee / Sam Kim 20 – 20 Alex Diaz / Morgan Wu\n' +
      'Jordan Lee / Sam Kim — – — Alex Diaz / Morgan Wu',
    );
  });

  it('uses player IDs so only the viewer slot becomes You when names match', () => {
    const output = formatSessionResults({
      contextLabel: 'Pickup · Session #2',
      date: 'not-a-date',
      viewerPlayerId: 10,
      games: [game({ team1_player2_name: 'Jordan Lee' })],
    });

    expect(output).toBe(
      'Pickup · Session #2 · not-a-date\n' +
      'You / Jordan Lee 21 – 18 Alex Diaz / Morgan Wu',
    );
    expect(output.match(/You/g)).toHaveLength(1);
  });

  it('does not guess when a malformed game repeats the viewer ID', () => {
    const output = formatSessionResults({
      contextLabel: 'Pickup · Session #3',
      date: '2026-09-20',
      viewerPlayerId: 10,
      games: [game({ team1_player2_id: 10 })],
    });

    expect(output).not.toContain('You');
  });
});
