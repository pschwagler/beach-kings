import { resolveNotificationRoute } from '@/features/notifications/navigation';
import { PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';

describe('resolveNotificationRoute', () => {
  it('routes account safety updates to the account status screen', () => {
    expect(resolveNotificationRoute('/account-status')).toBe(
      '/(stack)/settings/account-status',
    );
  });
  it.each([
    ['/home', '/(tabs)/home'],
    ['/home?tab=messages', '/(tabs)/social?tab=messages'],
    ['/home?tab=messages&thread=42', '/(stack)/messages/42'],
    ['/home?tab=friends', '/(tabs)/social?tab=friends'],
    ['/home?tab=notifications', '/(tabs)/social?tab=notifications'],
    ['/league/7', '/(stack)/league/7'],
    ['/league/7?tab=messages', '/(stack)/league/7?tab=chat'],
    ['/league/7?tab=details', '/(stack)/league/7?tab=info'],
    ['/league/7?tab=rankings', '/(stack)/league/7?tab=standings'],
    ['/league/7?tab=games', '/(stack)/league/7?tab=games'],
    ['/league/7?tab=awards', '/(stack)/league/7?tab=standings'],
    ['/player/12/pat-player', '/(stack)/player/12'],
    [
      `${PUBLIC_WEB_ORIGIN}/home?tab=friends`,
      '/(tabs)/social?tab=friends',
    ],
  ])('maps %s to %s', (linkUrl, expected) => {
    expect(resolveNotificationRoute(linkUrl)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['https://example.com/home'],
    ['/admin'],
    ['/league/not-an-id'],
    ['not a valid internal route'],
  ])('rejects unsupported link %p', (linkUrl) => {
    expect(resolveNotificationRoute(linkUrl)).toBeNull();
  });
});
