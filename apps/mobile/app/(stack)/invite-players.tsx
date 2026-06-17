/**
 * Invite-Players route.
 *
 * Reads its params from {@link useInvitePlayers} (set by the caller before
 * navigation) and forwards them to {@link InvitePlayersScreen}. If no pending
 * params are present (deep link or refresh), redirects back to Home.
 */

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';

import InvitePlayersScreen from '@/components/screens/Sessions/InvitePlayersScreen';
import { useInvitePlayers } from '@/contexts/InvitePlayersContext';
import { routes } from '@/lib/navigation';

export default function InvitePlayersRoute(): React.ReactNode {
  const router = useRouter();
  const { pending, clearPending } = useInvitePlayers();

  useEffect(() => {
    if (pending == null) {
      router.replace(routes.home());
    }
  }, [pending, router]);

  // Clear the bridged params on leave so a stale session's invite list can't
  // flash before the next (unrelated) open overwrites it.
  useEffect(() => clearPending, [clearPending]);

  if (pending == null) return null;

  return <InvitePlayersScreen {...pending} />;
}
