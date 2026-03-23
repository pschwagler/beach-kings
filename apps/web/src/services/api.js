/**
 * API barrel — re-exports all endpoints and client infrastructure.
 * Consumer imports remain unchanged: `import { getPlayers, ... } from '../services/api'`
 */
export { default } from './api-client';
export { setAuthTokens, clearAuthTokens, getStoredTokens } from './api-client';
export * from './endpoints/players';
export * from './endpoints/matches';
export * from './endpoints/sessions';
export * from './endpoints/leagues';
export * from './endpoints/courts';
export * from './endpoints/friends';
export * from './endpoints/notifications';
export * from './endpoints/users';
export * from './endpoints/photos';
export * from './endpoints/awards';
export * from './endpoints/kob';
export * from './endpoints/signups';
export * from './endpoints/messages';
export * from './endpoints/invites';
export * from './endpoints/admin';
