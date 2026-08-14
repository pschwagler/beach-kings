/**
 * Find Players route — redirects into the Social hub.
 *
 * Player discovery now lives in the Social tab's Find Players subnav (single
 * source of truth). This route stays only so existing deep links to
 * /(stack)/find-players still resolve — it forwards to the hub with the Find
 * Players tab selected.
 */

import React from 'react';
import { Redirect } from 'expo-router';
import { routes } from '@/lib/navigation';

export default function FindPlayersRoute(): React.ReactNode {
  return <Redirect href={routes.social({ tab: 'findplayers' })} />;
}
