/**
 * Notifications route — redirects into the Social hub.
 *
 * Notifications now live in the Social tab's Notifications subnav (single source
 * of truth). This route stays only so existing deep links to
 * /(stack)/notifications still resolve — it forwards to the hub with the
 * Notifications tab selected.
 */

import React from 'react';
import { Redirect } from 'expo-router';
import { routes } from '@/lib/navigation';

export default function NotificationsRoute(): React.ReactNode {
  return <Redirect href={routes.social({ tab: 'notifications' })} />;
}
