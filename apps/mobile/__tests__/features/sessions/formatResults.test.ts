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
  it('formats the session date and each numbered game in display order', () => {
    expect(formatSessionResults({
      contextLabel: 'Tuesday League · Session #4',
      date: '2026-09-20',
      games: [
        game({ game_number: 3 }),
        game({ id: 2, game_number: 8, team1_score: 19, team2_score: 21, winner: 2 }),
      ],
    })).toBe([
      '```Tuesday League · Session #4',
      'Sep 20, 2026',
      '',
      'Game  Pts  Players',
      '----  ---  -------------------',
      '  #3   21  Jordan Lee',
      '           Sam Kim',
      '       18  Alex Diaz',
      '           Morgan Wu',
      '----  ---  -------------------',
      '  #8   19  Jordan Lee',
      '           Sam Kim',
      '       21  Alex Diaz',
      '           Morgan Wu```',
    ].join('\n'));
  });

  it('preserves tied, zero, and missing scores with full names and a missing player label', () => {
    const output = formatSessionResults({
      contextLabel: 'Pickup · Session #1',
      date: 'not-a-date',
      games: [
        game({ team1_player1_name: '  Jordan Lee  ', team1_player2_name: 'Jordan Lee',
          team1_score: 20, team2_score: 20, winner: null }),
        game({ id: 2, game_number: 2, team1_player2_name: '   ', team1_score: 0,
          team2_score: null, winner: null }),
      ],
    });

    expect(output).toContain('Pickup · Session #1\nnot-a-date');
    expect(output).toContain('  #1   20  Jordan Lee\n           Jordan Lee\n       20  Alex Diaz');
    expect(output).toContain('  #2    0  Jordan Lee\n           Unknown player\n        —  Alex Diaz');
  });

  it('wraps long names and keeps input formatting inside one monospace block', () => {
    const output = formatSessionResults({
      contextLabel: 'Pickup\n``` Session #2',
      date: 'date\r\n```',
      games: [game({
        team1_player1_name: '  Alexandra\tSmith-Jones  Rivera ',
        team2_player1_name: 'Ana\u2028``` • *Smith*',
      })],
    });

    expect(output.match(/```/g)).toHaveLength(2);
    expect(output).toContain('```Pickup ｀｀｀ Session #2\ndate ｀｀｀');
    expect(output).toContain('  #1   21  Alexandra\n           Smith-Jones Rivera\n           Sam Kim');
    expect(output).toContain('       18  Ana ｀｀｀ • *Smith*');
  });

  it('keeps a submitted session without games copyable', () => {
    expect(formatSessionResults({
      contextLabel: 'Pickup · Session #1',
      date: '2026-09-20',
      games: [],
    })).toBe('```Pickup · Session #1\nSep 20, 2026```');
  });
});
