/**
 * NotificationsTab — Social hub container for the Notifications subnav
 * destination.
 *
 * Owns the `useNotificationsScreen` data hook and spreads it into the
 * chrome-free {@link NotificationsBody}. Mounting only while the Notifications
 * tab is active keeps its fetch lazy. The standalone `NotificationsScreen`
 * composes the same body with its own TopNav "Mark all read" chrome.
 */

import React from 'react';
import { useNotificationsScreen } from '@/components/screens/Notifications/useNotificationsScreen';
import NotificationsBody from '@/components/screens/Notifications/NotificationsBody';

export default function NotificationsTab(): React.ReactNode {
  const state = useNotificationsScreen();
  return <NotificationsBody {...state} />;
}
