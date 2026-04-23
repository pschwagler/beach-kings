// Shared constants for the Beach League application

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

export const SKILL_LEVEL_OPTIONS = [
  { value: 'juniors', label: 'Juniors', description: 'under 18' },
  { value: 'beginner', label: 'Beginner', description: 'just starting' },
  { value: 'intermediate', label: 'Intermediate', description: 'recreational' },
  { value: 'advanced', label: 'Advanced', description: 'competitive' },
  { value: 'AA', label: 'AA', description: 'advanced' },
  { value: 'Open', label: 'Open', description: 'elite' },
] as const;

export const SKILL_LEVEL_DESCRIPTIONS: Record<
  (typeof SKILL_LEVEL_OPTIONS)[number]['value'],
  string
> = Object.fromEntries(
  SKILL_LEVEL_OPTIONS.map((opt) => [opt.value, opt.description]),
) as Record<(typeof SKILL_LEVEL_OPTIONS)[number]['value'], string>;

// API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    SIGNUP: '/api/auth/signup',
    REFRESH: '/api/auth/refresh',
    LOGOUT: '/api/auth/logout',
    VERIFY_PHONE: '/api/auth/verify-phone',
    SEND_VERIFICATION: '/api/auth/send-verification',
  },
  PLAYERS: {
    LIST: '/api/players',
    DETAIL: (id: number | string) => `/api/players/${id}`,
    STATS: (id: number | string) => `/api/players/${id}`,
    MATCHES: (id: number | string) => `/api/players/${id}/matches`,
  },
  LEAGUES: {
    LIST: '/api/leagues',
    DETAIL: (id: number) => `/api/leagues/${id}`,
    MEMBERS: (id: number) => `/api/leagues/${id}/members`,
    SEASONS: (id: number) => `/api/leagues/${id}/seasons`,
  },
  MATCHES: {
    LIST: '/api/matches',
    CREATE: '/api/matches',
    DETAIL: (id: number) => `/api/matches/${id}`,
    SEARCH: '/api/matches/search',
  },
} as const;

