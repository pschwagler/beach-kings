/**
 * FindPlayersTab — Social hub container for the Find Players subnav destination.
 *
 * Owns the player search query and the shared {@link useDiscoverPlayers} data
 * hook (discover list + optimistic add-friend), then spreads the result into
 * the chrome-free {@link FindPlayersBody}. Kept as a standalone component
 * (rather than inlined in SocialScreen) so it only mounts — and therefore only
 * fetches — while the Find Players tab is active.
 *
 * Wireframe ref: find-players.html
 */

import React, { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { routes } from "@/lib/navigation";
import { useDiscoverPlayers } from "@/components/screens/FindPlayers/useDiscoverPlayers";
import FindPlayersBody from "./FindPlayersBody";

export default function FindPlayersTab({
  scrollRequest,
}: {
  readonly scrollRequest?: number;
}): React.ReactNode {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const discover = useDiscoverPlayers({ searchQuery });

  const onPlayerPress = useCallback(
    (playerId: number) => {
      router.push(routes.player(playerId));
    },
    [router],
  );

  return (
    <FindPlayersBody
      {...discover}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      onPlayerPress={onPlayerPress}
      scrollRequest={scrollRequest}
    />
  );
}
