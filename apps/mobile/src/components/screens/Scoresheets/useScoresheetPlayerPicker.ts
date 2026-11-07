import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlayerSearchItem, SkillLevel } from "@beach-kings/shared";
import { SKILL_LEVEL_OPTIONS } from "@beach-kings/shared";
import { useAuth } from "@/contexts/AuthContext";
import { useAddNewPlayer } from "@/contexts/AddNewPlayerContext";
import { sessionKeys, sessionQueries } from "@/features/sessions";
import { leagueQueries } from "@/features/leagues";
import useDebounce from "@/hooks/useDebounce";
import { routes } from "@/lib/navigation";

export function useScoresheetPlayerPicker(
  leagueId: number | null,
  rawName: string,
  onResolve: (raw: string, id: number, name: string) => void,
) {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const router = useRouter();
  const client = useQueryClient();
  const bridge = useAddNewPlayer();
  const pendingName = useRef<string | null>(null);
  const [search, setSearch] = useState(rawName);
  const debouncedSearch = useDebounce(search, 250);
  const current = search.trim() === debouncedSearch.trim();
  // Same key, transport, cancellation, and ranking as the scoreboard picker.
  const query = useQuery(
    sessionQueries.playerSearch(
      userId,
      null,
      current ? debouncedSearch : "",
      leagueId,
      current,
    ),
  );
  const league = useQuery(leagueQueries.detail(userId, leagueId ?? 0));
  const players = current ? (query.data?.items ?? []) : [];
  const leaguePlayers = players.filter((player) =>
    player.tags.includes("in_league"),
  );
  const otherPlayers = players.filter(
    (player) => !player.tags.includes("in_league"),
  );

  const select = (player: PlayerSearchItem) => {
    onResolve(
      rawName,
      player.id,
      (player.full_name ??
        [player.first_name, player.last_name].filter(Boolean).join(" ")) ||
        `Player ${player.id}`,
    );
  };
  const create = () => {
    pendingName.current = rawName;
    const level = league.data?.level;
    bridge.setRequest({
      source: "scoresheet",
      team: 1,
      slot: 0,
      prefillName: search.trim() || rawName,
      inferredGender:
        league.data?.gender === "mens"
          ? "male"
          : league.data?.gender === "womens"
            ? "female"
            : null,
      inferredLevel: SKILL_LEVEL_OPTIONS.some(
        (option) => option.value === level,
      )
        ? (level as SkillLevel)
        : null,
      leagueId,
    });
    router.push(routes.addNewPlayer());
  };
  const consumeCreatedPlayer = useCallback(() => {
    if (pendingName.current == null) return;
    const result = bridge.consumeResult("scoresheet");
    if (result == null) return;
    const name = pendingName.current;
    pendingName.current = null;
    void client.invalidateQueries({
      queryKey: sessionKeys.playerSearchRoot(userId, null),
    });
    onResolve(name, result.player_id, result.name);
  }, [bridge.consumeResult, client, userId, onResolve]);
  useEffect(() => {
    if (bridge.result?.source === "scoresheet") consumeCreatedPlayer();
  }, [bridge.result, consumeCreatedPlayer]);
  // Native form sheets can freeze the previous screen; read the bridge's ref
  // when focus returns, just as the scoreboard does.
  useFocusEffect(consumeCreatedPlayer);
  return {
    search,
    setSearch,
    leaguePlayers,
    otherPlayers,
    select,
    create,
    isLoading: !current || query.isPending || query.isFetching,
    error: current ? query.error : null,
    retry: query.refetch,
  };
}
