import type {
  PlayerSearchItem,
  PlayerSearchTag,
  SessionGame,
  SkillLevel,
} from "@beach-kings/shared";
import { SKILL_LEVEL_OPTIONS } from "@beach-kings/shared";

export type SubmitState = "idle" | "loading" | "success" | "error";
export type DeleteState = "idle" | "loading" | "error";

export interface PlayerSlot {
  readonly player_id: number | null;
  readonly display_name: string;
  readonly initials: string;
  readonly is_guest?: boolean;
  readonly avatar_url?: string | null;
}

export const EMPTY_SLOT: PlayerSlot = {
  player_id: null,
  display_name: "",
  initials: "",
};

export interface RosterPlayer {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly tags: readonly PlayerSearchTag[];
  readonly isSession: boolean;
  readonly is_guest?: boolean;
  readonly avatar_url?: string | null;
}

export interface UseScoreGameScreenOptions {
  readonly sessionId?: number | null;
  readonly leagueId?: number | null;
  readonly seasonId?: number | null;
  readonly matchId?: number | null;
  readonly currentPlayerId?: number | null;
}

export interface UseScoreGameScreenResult {
  readonly team1: readonly [PlayerSlot, PlayerSlot];
  readonly team2: readonly [PlayerSlot, PlayerSlot];
  readonly score1: number;
  readonly score2: number;
  readonly roster: readonly RosterPlayer[];
  readonly search: string;
  readonly filteredRoster: readonly RosterPlayer[];
  readonly isSearching: boolean;
  readonly submitState: SubmitState;
  readonly errorMessage: string | null;
  readonly canSubmit: boolean;
  readonly isRanked: boolean;
  readonly lastSessionId: number | null;
  readonly savedMatchId: number | null;
  readonly filledCount: number;
  readonly isBuilding: boolean;
  readonly activeNextSlot: {
    readonly team: 1 | 2;
    readonly slot: 0 | 1;
  } | null;
  readonly scoreWarning: string | null;
  readonly scoreWarningKind: "error" | "warning" | null;
  readonly currentPlayerId: number | null;
  readonly isEditMode: boolean;
  readonly deleteState: DeleteState;
  readonly sessionId: number | null;
  readonly canShare: boolean;
  readonly onShareSession: () => Promise<void>;
  readonly setScore1: (n: number) => void;
  readonly setScore2: (n: number) => void;
  readonly assignPlayer: (
    team: 1 | 2,
    slot: 0 | 1,
    player: RosterPlayer | null,
  ) => void;
  readonly removePlayer: (team: 1 | 2, slot: 0 | 1) => void;
  readonly swapSlots: (
    from: { team: 1 | 2; slot: 0 | 1 },
    to: { team: 1 | 2; slot: 0 | 1 },
  ) => void;
  readonly setSearch: (q: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onDismissError: () => void;
  readonly onAddAnother: () => void;
  readonly onDelete: () => Promise<boolean>;
  readonly pendingShareInvite: {
    readonly name: string;
    readonly invite_url: string;
    readonly team: 1 | 2;
  } | null;
  readonly openAddNewPlayer: (target: { team: 1 | 2; slot: 0 | 1 }) => void;
  readonly clearPendingShareInvite: () => void;
}

export function toInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return (parts[0]?.[0] ?? "").toUpperCase();
  return (
    (parts[0]?.[0] ?? "").toUpperCase() +
    (parts[parts.length - 1]?.[0] ?? "").toUpperCase()
  );
}

export function deriveInitialSlots(game: SessionGame | null): {
  readonly team1: [PlayerSlot, PlayerSlot];
  readonly team2: [PlayerSlot, PlayerSlot];
  readonly score1: number;
  readonly score2: number;
  readonly isRanked: boolean;
} {
  if (game == null) {
    return {
      team1: [EMPTY_SLOT, EMPTY_SLOT],
      team2: [EMPTY_SLOT, EMPTY_SLOT],
      score1: 0,
      score2: 0,
      isRanked: false,
    };
  }
  const slot = (id: number | null, name: string): PlayerSlot =>
    id == null
      ? EMPTY_SLOT
      : { player_id: id, display_name: name, initials: toInitials(name) };
  return {
    team1: [
      slot(game.team1_player1_id, game.team1_player1_name),
      slot(game.team1_player2_id, game.team1_player2_name),
    ],
    team2: [
      slot(game.team2_player1_id, game.team2_player1_name),
      slot(game.team2_player2_id, game.team2_player2_name),
    ],
    score1: game.team1_score ?? 0,
    score2: game.team2_score ?? 0,
    isRanked: game.is_ranked ?? false,
  };
}

export function mapSearchItem(item: PlayerSearchItem): RosterPlayer {
  return {
    player_id: item.id,
    display_name: item.full_name ?? `Player ${item.id}`,
    initials:
      item.initials && item.initials.length > 0
        ? item.initials
        : toInitials(item.full_name ?? ""),
    tags: item.tags ?? [],
    isSession: item.in_session ?? false,
    is_guest: item.is_guest ?? false,
    avatar_url: item.profile_picture_url ?? null,
  };
}

export function buildFallbackRoster(
  participants: ReadonlyArray<{ player_id: number; full_name: string }>,
  friendItems: ReadonlyArray<{ player_id: number; full_name: string }>,
): RosterPlayer[] {
  const sessionPlayers: RosterPlayer[] = participants.map((participant) => ({
    player_id: participant.player_id,
    display_name: participant.full_name,
    initials: toInitials(participant.full_name),
    tags: [],
    isSession: true,
  }));
  const sessionPlayerIds = new Set(
    sessionPlayers.map((player) => player.player_id),
  );
  const friendPlayers: RosterPlayer[] = friendItems
    .filter((friend) => !sessionPlayerIds.has(friend.player_id))
    .map((friend) => ({
      player_id: friend.player_id,
      display_name: friend.full_name,
      initials: toInitials(friend.full_name),
      tags: ["friend"],
      isSession: false,
    }));
  return [...sessionPlayers, ...friendPlayers];
}

export function inferGenderLevel(
  participants: ReadonlyArray<{
    gender?: string | null;
    level?: string | null;
  }>,
): { gender?: "male" | "female"; level?: SkillLevel } {
  const validLevels = new Set<string>(
    SKILL_LEVEL_OPTIONS.map((option) => option.value),
  );
  const genderCounts = new Map<string, number>();
  const levelCounts = new Map<string, number>();
  for (const participant of participants) {
    if (participant.gender != null && participant.gender !== "") {
      genderCounts.set(
        participant.gender,
        (genderCounts.get(participant.gender) ?? 0) + 1,
      );
    }
    if (
      participant.level != null &&
      participant.level !== "" &&
      validLevels.has(participant.level)
    ) {
      levelCounts.set(
        participant.level,
        (levelCounts.get(participant.level) ?? 0) + 1,
      );
    }
  }
  const topGender = [...genderCounts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];
  const topLevel = [...levelCounts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];
  const result: { gender?: "male" | "female"; level?: SkillLevel } = {};
  if (topGender === "male" || topGender === "female") result.gender = topGender;
  if (topLevel != null && validLevels.has(topLevel)) {
    result.level = topLevel as SkillLevel;
  }
  return result;
}
