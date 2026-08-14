/**
 * Messages inbox route — redirects into the Social hub.
 *
 * The inbox now lives in the Social tab's Messages subnav (single source of
 * truth). This route stays only so existing deep links to /(stack)/messages
 * still resolve — it forwards to the hub with the Messages tab selected.
 */

import React from 'react';
import { Redirect } from 'expo-router';
import { routes } from '@/lib/navigation';

export default function MessagesListRoute(): React.ReactNode {
  return <Redirect href={routes.social({ tab: 'messages' })} />;
}
