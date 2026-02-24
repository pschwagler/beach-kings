// Shared constants for the Beach League application

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

export const SKILL_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'AA', label: 'AA' },
  { value: 'Open', label: 'Open' },
] as const;

export type Gender = typeof GENDER_OPTIONS[number]['value'];
export type SkillLevel = typeof SKILL_LEVEL_OPTIONS[number]['value'];

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

