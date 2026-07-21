/**
 * API methods for Beach League backend.
 *
 * Composed from per-domain factories (see `./<domain>Methods.ts`). Add new
 * endpoints to the owning domain module, not here.
 */

import type { ApiClient } from './client';
import { createAdminMethods } from './adminMethods';
import { createAuthMethods } from './authMethods';
import { createCourtMethods } from './courtMethods';
import { createLeagueMethods } from './leagueMethods';
import { createLeagueInviteMethods } from './leagueInviteMethods';
import { createMatchMethods } from './matchMethods';
import { createMessageMethods } from './messageMethods';
import { createNotificationMethods } from './notificationMethods';
import { createPlayerMethods } from './playerMethods';
import { createRankingMethods } from './rankingMethods';
import { createSessionMethods } from './sessionMethods';
import { createSignupMethods } from './signupMethods';
import { createSocialMethods } from './socialMethods';
import { createStatsMethods } from './statsMethods';
import { createUserMethods } from './userMethods';

// Re-exported for backwards compatibility with deep imports from './methods'.
export { mapPublicPlayerToPlayer } from './playerMethods';

export function createApiMethods(client: ApiClient) {
  const api = client.axiosInstance;

  return {
    // Auth
    ...createAuthMethods(api),
    // Player (incl. public invite claim)
    ...createPlayerMethods(api),
    // Match
    ...createMatchMethods(api),
    // Rankings
    ...createRankingMethods(api),
    // League + Season
    ...createLeagueMethods(api),
    // Session
    ...createSessionMethods(api),
    // User
    ...createUserMethods(api),
    // Location + Court + Saved courts + Weekly schedule
    ...createCourtMethods(api),
    // Season signups + League signups
    ...createSignupMethods(api),
    // Friends
    ...createSocialMethods(api),
    // Notifications
    ...createNotificationMethods(api),
    // Derived stats
    ...createStatsMethods(api),
    // Feedback + Admin + Health
    ...createAdminMethods(api),
    // Direct Messages
    ...createMessageMethods(api),
    // League invites
    ...createLeagueInviteMethods(api),
  };
}

export type ApiMethods = ReturnType<typeof createApiMethods>;
