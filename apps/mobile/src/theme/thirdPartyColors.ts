/**
 * Official third-party identity colors.
 *
 * These values are intentionally not semantic app colors: changing them with
 * the Beach Kings theme would misrepresent the provider brands. Keep all such
 * exceptions named and centralized here instead of embedding literals in UI.
 */
export const thirdPartyColors = {
  apple: {
    lightBackground: '#000000',
    lightForeground: '#ffffff',
  },
  google: {
    blue: '#4285f4',
    green: '#34a853',
    yellow: '#fbbc05',
    red: '#ea4335',
  },
} as const;
