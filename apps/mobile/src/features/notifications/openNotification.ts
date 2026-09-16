import { Alert } from 'react-native';
import { routes } from '@/lib/navigation';
import { resolveNotificationRoute } from './navigation';

interface NotificationDestination {
  readonly id: number;
  readonly type: string;
  readonly link_url: string | null;
  readonly title: string;
  readonly message: string;
}

/** One tap policy for inbox, socket toast and native push. Never open raw URLs. */
export function openNotification(
  notification: NotificationDestination,
  navigate: (route: string) => void,
  markAsRead: (id: number) => void,
): void {
  const resolved = resolveNotificationRoute(notification.link_url);
  const route = notification.type === 'friend_request' && resolved === routes.notifications()
    ? routes.social({ tab: 'friends' })
    : resolved;
  const needsDetails = notification.type === 'moderation_update' || route == null ||
    route === routes.home() || route === routes.notifications();
  if (!needsDetails) {
    navigate(route);
    markAsRead(notification.id);
    return;
  }

  // These fields are the already-delivered user-facing notification, never
  // internal moderation payloads or links to content the viewer cannot access.
  const acknowledge = () => markAsRead(notification.id);
  Alert.alert(notification.title || 'Notification', notification.message || 'No additional details are available.', [
    { text: 'Done', onPress: acknowledge },
    ...(notification.type === 'moderation_update' ? [{
      text: 'Account status',
      onPress: () => {
        navigate(routes.settingsAccountStatus());
        acknowledge();
      },
    }] : []),
  ]);
}
