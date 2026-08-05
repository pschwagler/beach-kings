/**
 * Immutable identity colors used to keep a player's fallback avatar stable
 * across light/dark theme changes. These decorative colors are deliberately
 * centralized rather than treated as semantic status or surface roles.
 */
export const avatarTeamColors = {
  teal: { bg: '#4daacc', fg: '#ffffff' },
  gold: { bg: '#d4a843', fg: '#182326' },
} as const;

export const avatarVarietyColors = [
  { bg: '#bae6fd', fg: '#0c4a6e' },
  { bg: '#fed7aa', fg: '#9a3412' },
  { bg: '#ddd6fe', fg: '#5b21b6' },
  { bg: '#bbf7d0', fg: '#14532d' },
  { bg: '#fde68a', fg: '#854d0e' },
  { bg: '#fbcfe8', fg: '#9d174d' },
] as const;
