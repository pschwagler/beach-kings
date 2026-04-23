/**
 * Notifications route — thin entry point.
 * Delegates entirely to NotificationsScreen which owns all state and layout.
 */

import React from 'react';
import { NotificationsScreen } from '@/components/screens/Notifications';

export default function NotificationsRoute(): React.ReactNode {
  return <NotificationsScreen />;
}
