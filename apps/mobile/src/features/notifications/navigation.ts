import { routes, type LeagueTab, type SocialTab } from '@/lib/navigation';
import { PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';

const HOME_SOCIAL_TABS: Readonly<Record<string, SocialTab>> = {
  messages: 'messages',
  notifications: 'notifications',
  friends: 'friends',
};

const LEAGUE_TABS: Readonly<Record<string, LeagueTab>> = {
  games: 'games',
  rankings: 'standings',
  messages: 'chat',
  details: 'info',
  awards: 'standings',
};

function parseInternalUrl(linkUrl: string): URL | null {
  try {
    const url = new URL(linkUrl, PUBLIC_WEB_ORIGIN);
    return url.origin === PUBLIC_WEB_ORIGIN ? url : null;
  } catch {
    return null;
  }
}

function isNumericId(value: string | null): value is string {
  return value != null && /^\d+$/.test(value);
}

/**
 * Translate backend/web notification links into routes owned by Expo Router.
 *
 * Unknown and external links intentionally resolve to null. Notification taps
 * may still mark the row read, but must never push an unverified route.
 */
export function resolveNotificationRoute(linkUrl: string | null): string | null {
  if (linkUrl == null || linkUrl.trim().length === 0) return null;

  const url = parseInternalUrl(linkUrl.trim());
  if (url == null) return null;

  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/' || pathname === '/home') {
    const tab = url.searchParams.get('tab');
    const socialTab = tab == null ? null : HOME_SOCIAL_TABS[tab];
    if (socialTab === 'messages') {
      const threadId = url.searchParams.get('thread');
      return isNumericId(threadId)
        ? routes.messagesThread(threadId)
        : routes.social({ tab: 'messages' });
    }
    return socialTab != null ? routes.social({ tab: socialTab }) : routes.home();
  }

  if (pathname === '/notifications') {
    return routes.social({ tab: 'notifications' });
  }
  if (pathname === '/messages') {
    return routes.social({ tab: 'messages' });
  }
  if (pathname === '/account-status') {
    return routes.settingsAccountStatus();
  }

  const leagueMatch = pathname.match(/^\/leagues?\/(\d+)$/);
  if (leagueMatch != null) {
    const leagueId = leagueMatch[1];
    const webTab = url.searchParams.get('tab');
    const mobileTab = webTab == null ? null : LEAGUE_TABS[webTab];
    return mobileTab != null
      ? routes.league(leagueId, { tab: mobileTab })
      : routes.league(leagueId);
  }

  const playerMatch = pathname.match(/^\/player\/(\d+)(?:\/[^/]+)?$/);
  if (playerMatch != null) {
    return routes.player(playerMatch[1]);
  }

  return null;
}
