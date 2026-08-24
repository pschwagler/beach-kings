import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { MyStatsPayload } from '@beach-kings/shared';
import MyStatsWidget, {
  formatStatsWinRate,
  getRecentRatingChange,
} from '@/components/home/MyStatsWidget';

const STATS: MyStatsPayload = {
  player_name: 'Player', player_city: null, player_level: null,
  overall: {
    wins: 8, losses: 2, games_played: 10, rating: 1450,
    peak_rating: 1460, win_rate: 80, current_streak: 2, avg_point_diff: 3,
  },
  trophies: [], partners: [], opponents: [],
  elo_timeline: [
    { date: '2026-08-01', rating: 1438 },
    { date: '2026-08-20', rating: 1450 },
  ],
};

describe('MyStatsWidget', () => {
  it('shows rating, record, win rate, and recent change', () => {
    const screen = render(<MyStatsWidget stats={STATS} onPress={jest.fn()} />);
    expect(screen.getByText('1450')).toBeTruthy();
    expect(screen.getByText('8-2')).toBeTruthy();
    expect(screen.getByText('80% win rate')).toBeTruthy();
    expect(screen.getByText('+12')).toBeTruthy();
  });

  it('is one accessible navigation target and remains flexible for large text', () => {
    const onPress = jest.fn();
    const screen = render(<MyStatsWidget stats={STATS} onPress={onPress} />);
    const widget = screen.getByTestId('home-my-stats-widget');
    expect(widget.props.accessibilityRole).toBe('button');
    expect(widget.props.accessibilityLabel).toContain('Win rate 80%');
    expect(widget.findByProps({ className: 'flex-row flex-wrap gap-sm' })).toBeTruthy();
    fireEvent.press(widget);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('handles negative and unavailable timeline changes', () => {
    expect(getRecentRatingChange(STATS.elo_timeline)).toBe(12);
    expect(getRecentRatingChange([{ date: '2026-08-01', rating: 1400 }])).toBeNull();
    const screen = render(
      <MyStatsWidget
        stats={{ ...STATS, elo_timeline: [
          { date: '2026-08-01', rating: 1450 },
          { date: '2026-08-20', rating: 1443 },
        ] }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('-7')).toBeTruthy();
  });

  it('uses the authoritative tie-inclusive win rate', () => {
    const overall = {
      ...STATS.overall,
      wins: 1,
      losses: 0,
      games_played: 2,
      win_rate: 50,
    };
    expect(formatStatsWinRate(overall)).toBe('50%');
    const screen = render(
      <MyStatsWidget stats={{ ...STATS, overall }} onPress={jest.fn()} />,
    );
    expect(screen.getByText('50% win rate')).toBeTruthy();
    expect(screen.getByTestId('home-my-stats-widget').props.accessibilityLabel)
      .toContain('Win rate 50%');
  });
});
