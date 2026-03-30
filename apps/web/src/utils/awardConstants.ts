/**
 * Shared award display config used by LeagueAwardsTab and PlayerTrophies.
 *
 * Icon imports are deferred to consumers (lucide-react tree-shaking).
 * Consumers map iconName → actual component at import time.
 */

export type AwardConfig = { label: string; subtitle?: string; iconName: string; colorClass: string };

export const AWARD_CONFIG: Record<string, AwardConfig> = {
  gold: { label: '1st Place', iconName: 'Trophy', colorClass: 'gold' },
  silver: { label: '2nd Place', iconName: 'Trophy', colorClass: 'silver' },
  bronze: { label: '3rd Place', iconName: 'Trophy', colorClass: 'bronze' },
  ironman: { label: 'Ironman', subtitle: 'Most Games', iconName: 'Flame', colorClass: 'stat' },
  sharpshooter: { label: 'Sharpshooter', subtitle: 'Best Win Rate', iconName: 'Target', colorClass: 'stat' },
  point_machine: { label: 'Point Machine', subtitle: 'Best Avg Pt Diff', iconName: 'Zap', colorClass: 'stat' },
  rising_star: { label: 'Rising Star', subtitle: 'Most ELO Growth', iconName: 'TrendingUp', colorClass: 'stat' },
};

/**
 * Format a stat value for display based on award key.
 *
 * @param {string} awardKey - The award_key from the API
 * @param {number|null} value - The raw stat value
 * @returns {string} Human-readable value string
 */
export function formatAwardValue(awardKey: string, value: number | null | undefined): string {
  if (value == null) return '';
  switch (awardKey) {
    case 'gold':
    case 'silver':
    case 'bronze':
      return `${Math.round(value)} pts`;
    case 'sharpshooter':
      return `${(value * 100).toFixed(0)}%`;
    case 'point_machine': {
      const sign = value >= 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}`;
    }
    case 'rising_star': {
      const sign = value >= 0 ? '+' : '';
      return `${sign}${Math.round(value)} ELO`;
    }
    case 'ironman':
      return `${Math.round(value)} games`;
    default:
      return String(value);
  }
}
