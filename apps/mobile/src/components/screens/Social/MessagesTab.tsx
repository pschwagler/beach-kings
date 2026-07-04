/**
 * MessagesTab — Social hub container for the Messages subnav destination.
 *
 * Owns the `useMessagesScreen` data hook and spreads it into the chrome-free
 * {@link MessagesBody}. Kept as a standalone component (rather than inlined in
 * SocialScreen) so it only mounts — and therefore only fetches — while the
 * Messages tab is active. The standalone `MessagesScreen` composes the same
 * body with its own TopNav chrome.
 */

import React from 'react';
import { useMessagesScreen } from '@/components/screens/Messages/useMessagesScreen';
import MessagesBody from '@/components/screens/Messages/MessagesBody';

export default function MessagesTab(): React.ReactNode {
  const state = useMessagesScreen();
  return <MessagesBody {...state} />;
}
