/**
 * FriendsTab — Social hub container for the Friends subnav destination.
 *
 * Owns the friend search query and the shared {@link useFriends} data hook
 * (friends, incoming requests, and suggestions), then spreads the result into
 * the chrome-free {@link FriendsBody}. Kept as a standalone component (rather
 * than inlined in SocialScreen) so it only mounts — and therefore only fetches —
 * while the Friends tab is active.
 *
 * Wireframe ref: friends.html
 */

import React, { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { routes } from "@/lib/navigation";
import { useFriends } from "@/components/screens/FindPlayers/useFriends";
import FriendsBody from "./FriendsBody";

interface FriendsTabProps {
  /** Switch the hub to the Find Players subnav (empty-state CTA) — no push. */
  readonly onFindPlayers?: () => void;
  readonly scrollRequest?: number;
}

export default function FriendsTab({
  onFindPlayers,
  scrollRequest,
}: FriendsTabProps): React.ReactNode {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const friends = useFriends({ searchQuery, withSuggestions: true });

  const onPlayerPress = useCallback(
    (playerId: number) => {
      router.push(routes.player(playerId));
    },
    [router],
  );

  const onMessagePress = useCallback(
    (playerId: number, fullName: string) => {
      router.push(routes.messages(playerId, fullName));
    },
    [router],
  );

  const handleFindPlayers = useCallback(() => {
    onFindPlayers?.();
  }, [onFindPlayers]);

  return (
    <FriendsBody
      {...friends}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      onPlayerPress={onPlayerPress}
      onMessagePress={onMessagePress}
      onFindPlayers={handleFindPlayers}
      scrollRequest={scrollRequest}
    />
  );
}
