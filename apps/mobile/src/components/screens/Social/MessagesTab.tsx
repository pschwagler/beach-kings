/**
 * MessagesTab — Social hub container for the Messages subnav destination.
 *
 * Owns the `useMessagesScreen` data hook and spreads it into the chrome-free
 * {@link MessagesBody}. Kept as a standalone component (rather than inlined in
 * SocialScreen) so it only mounts — and therefore only fetches — while the
 * Messages tab is active.
 *
 * Publishes a compose action into the shared hub TopNav. In the consolidated
 * hub, "new message" switches to the Find Players subnav (the people list) to
 * pick a recipient — no stack push.
 */

import React, { useMemo } from 'react';
import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useMessagesScreen } from '@/components/screens/Messages/useMessagesScreen';
import MessagesBody from '@/components/screens/Messages/MessagesBody';
import { useHeaderAction, type SetHeaderAction } from './useHeaderAction';

interface MessagesTabProps {
  readonly setHeaderAction?: SetHeaderAction;
  /** Start a new conversation — switches the hub to the Find Players subnav. */
  readonly onCompose?: () => void;
}

export default function MessagesTab({
  setHeaderAction,
  onCompose,
}: MessagesTabProps): React.ReactNode {
  const state = useMessagesScreen();

  const composeAction = useMemo(
    () => (
      <Pressable
        testID="messages-compose-btn"
        onPress={onCompose}
        accessibilityRole="button"
        accessibilityLabel="Start a new conversation"
        className="min-w-touch min-h-touch items-center justify-center active:opacity-70"
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
            stroke="#ffffff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
            stroke="#ffffff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
    ),
    [onCompose],
  );

  useHeaderAction(setHeaderAction, composeAction);

  return <MessagesBody {...state} />;
}
