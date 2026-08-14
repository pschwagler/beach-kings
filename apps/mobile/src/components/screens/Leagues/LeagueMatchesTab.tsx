/**
 * LeagueMatchesTab — Games tab of the League Detail screen.
 *
 * Top: compact segmented toggle — My Games | All Games — mirroring the
 * pattern used inside Session Detail. Active sessions are visually
 * distinguished from submitted ones via a left accent stripe, a "Live" pill
 * in the card header, and a footer that hides finalized stats.
 *
 * Wireframe ref: league-matches.html
 */

import React from "react";
import AppText from '@/components/ui/AppText';
import {
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useLeagueMatchesTab,
  type SessionGroup,
  type LeagueMatchesMode,
} from "./useLeagueMatchesTab";
import { routes } from "@/lib/navigation";
import {
  formatGameScore,
  GAME_SCORE_SEPARATOR,
} from "@/lib/formatters";
import { ChevronRightIcon } from "@/components/ui/icons";
import { usePaletteColors } from "@/theme/usePaletteColors";
import { hapticLight } from "@/utils/haptics";
import type { GameHistoryEntry, LeagueGameEntry } from "@beach-kings/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSessionDate(isoDate: string): string | null {
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(isoDate);
  const legacyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(isoDate);
  const [year, month, day] =
    isoMatch != null
      ? [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])]
      : legacyMatch != null
        ? [
            Number(legacyMatch[3]),
            Number(legacyMatch[1]),
            Number(legacyMatch[2]),
          ]
        : [Number.NaN, Number.NaN, Number.NaN];
  const d = new Date(year, month - 1, day);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  // Weekday + month + day (e.g. "Sat, May 24") — this is now the card's primary
  // header, so the weekday adds useful context over a bare "May 24".
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Tappable player name
// ---------------------------------------------------------------------------

interface PlayerNameProps {
  readonly name: string;
  readonly playerId: number | null;
  readonly className?: string;
}

function PlayerName({
  name,
  playerId,
  className = "",
}: PlayerNameProps): React.ReactNode {
  const router = useRouter();
  if (playerId == null) {
    return <AppText className={className}>{name}</AppText>;
  }
  return (
    <Pressable
      onPress={() => {
        router.push(routes.player(playerId));
      }}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
    >
      <AppText className={className}>{name}</AppText>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Game row — user-relative (My Games mode)
// ---------------------------------------------------------------------------

interface MyGameRowProps {
  readonly game: GameHistoryEntry;
  readonly hideRatingChange: boolean;
}

function MyGameRow({
  game,
  hideRatingChange,
}: MyGameRowProps): React.ReactNode {
  const isWin = game.result === "W";
  const isDraw = game.result === "D";
  const score = formatGameScore(game.my_score, game.opponent_score);

  return (
    <View
      testID={`game-row-${game.id}`}
      className="px-4 py-[10px] border-b border-divider"
    >
      <View className="flex-row items-start">
        <View className="flex-1 min-w-0 mr-2">
          <View className="flex-row flex-wrap items-center">
            <AppText className="text-[13px] font-semibold text-default">You</AppText>
            {game.partner_names.map((partnerName, i) => (
              <React.Fragment key={game.partner_ids[i] ?? `partner-${i}`}>
                <AppText className="text-[13px] text-muted"> / </AppText>
                <PlayerName
                  name={partnerName}
                  playerId={game.partner_ids[i] ?? null}
                  className="text-[13px] font-semibold text-default"
                />
              </React.Fragment>
            ))}
          </View>
          <View className="flex-row flex-wrap items-center mt-[4px]">
            <AppText className="text-[12px] text-muted">vs </AppText>
            {game.opponent_names.map((oppName, i) => (
              <React.Fragment key={game.opponent_ids[i] ?? `opp-${i}`}>
                {i > 0 && <AppText className="text-[12px] text-muted"> / </AppText>}
                <PlayerName
                  name={oppName}
                  playerId={game.opponent_ids[i] ?? null}
                  className="text-[12px] text-muted"
                />
              </React.Fragment>
            ))}
          </View>
        </View>

        <AppText className="text-[14px] font-bold text-default mr-2">
          {score}
        </AppText>

        <View
          className={`rounded-[6px] px-[8px] py-[3px] ${
            isWin
              ? "bg-success-tint"
              : isDraw
                ? "bg-warning-tint"
                : "bg-danger-tint"
          }`}
        >
          <AppText
            className={`text-[11px] font-bold ${
              isWin ? "text-success" : isDraw ? "text-warning" : "text-danger"
            }`}
          >
            {game.result}
          </AppText>
        </View>
      </View>

      {!hideRatingChange && game.rating_change != null && (
        <AppText
          className={`text-[11px] mt-[4px] ${
            game.rating_change > 0
              ? "text-success"
              : game.rating_change < 0
                ? "text-danger"
                : "text-muted"
          }`}
        >
          {game.rating_change > 0 ? "+" : ""}
          {game.rating_change} pts
        </AppText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Game row — team-neutral (All Games mode)
// ---------------------------------------------------------------------------

interface AllGameRowProps {
  readonly game: LeagueGameEntry;
}

function AllGameRow({ game }: AllGameRowProps): React.ReactNode {
  const team1Won = game.winner === 1;
  const team2Won = game.winner === 2;
  const isTie = game.winner === -1;
  const noResult = game.winner === 0;
  const score = formatGameScore(game.team1_score, game.team2_score);

  return (
    <View
      testID={`league-game-row-${game.id}`}
      className="px-4 py-[10px] border-b border-divider"
    >
      <View className="flex-row items-center">
        <View className="flex-1 min-w-0 mr-2">
          {/* Team 1 */}
          <View className="flex-row flex-wrap items-center">
            {game.team1_player_names.map((name, i) => (
              <React.Fragment key={game.team1_player_ids[i] ?? `t1-${i}`}>
                {i > 0 && <AppText className="text-[13px] text-muted"> / </AppText>}
                <PlayerName
                  name={name}
                  playerId={game.team1_player_ids[i] ?? null}
                  className={`text-[13px] ${team1Won ? "font-bold text-default" : "text-default"}`}
                />
              </React.Fragment>
            ))}
          </View>
          {/* Team 2 */}
          <View className="flex-row flex-wrap items-center mt-[4px]">
            <AppText className="text-[12px] text-muted">vs </AppText>
            {game.team2_player_names.map((name, i) => (
              <React.Fragment key={game.team2_player_ids[i] ?? `t2-${i}`}>
                {i > 0 && <AppText className="text-[12px] text-muted"> / </AppText>}
                <PlayerName
                  name={name}
                  playerId={game.team2_player_ids[i] ?? null}
                  className={`text-[12px] ${team2Won ? "font-bold text-default" : "text-muted"}`}
                />
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Score: bold the winning side's number */}
        <AppText
          testID={`league-game-score-${game.id}`}
          accessibilityLabel={`Score ${score}`}
          className="text-[14px] text-muted mr-2"
        >
          <AppText
            className={`text-[14px] ${team1Won ? "font-bold text-default" : "text-muted"}`}
          >
            {game.team1_score}
          </AppText>
          {GAME_SCORE_SEPARATOR}
          <AppText
            className={`text-[14px] ${team2Won ? "font-bold text-default" : "text-muted"}`}
          >
            {game.team2_score}
          </AppText>
        </AppText>

        {noResult && (
          <View
            testID={`league-game-noresult-${game.id}`}
            className="rounded-[6px] px-[8px] py-[3px] bg-elevated"
          >
            <AppText className="text-[11px] font-bold text-muted">—</AppText>
          </View>
        )}

        {isTie && (
          <View
            testID={`league-game-tie-${game.id}`}
            className="rounded-[6px] px-[8px] py-[3px] bg-elevated"
          >
            <AppText className="text-[11px] font-bold text-muted">TIE</AppText>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

interface SessionCardProps {
  readonly session: SessionGroup;
}

function SessionCard({ session }: SessionCardProps): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();
  const isActive = session.session_status === "ACTIVE";
  const totalRating = Math.round(session.ratingChange * 10) / 10;
  const dateLabel =
    session.session_date != null
      ? formatSessionDate(session.session_date)
      : null;
  const gameCount = session.gameCount;

  return (
    <View
      testID={`session-card-${session.session_id}`}
      className="bg-surface rounded-[12px] mx-4 mb-4 border border-divider overflow-hidden flex-row"
    >
      {/* Left accent stripe — visible only for active sessions */}
      {isActive && (
        <View
          testID={`session-card-${session.session_id}-active-stripe`}
          className="w-[4px] bg-status-live-fill"
        />
      )}

      <View className="flex-1">
        {/* Header */}
        <Pressable
          onPress={() => {
            router.push(routes.session(session.session_id));
          }}
          style={({ pressed }) => (pressed ? { opacity: 0.65 } : undefined)}
          className="flex-row items-center px-4 py-[12px] bg-elevated border-b border-divider"
        >
          <View className="flex-1">
            {/* Primary: the (user-editable) play date. Falls back to a stable
                session identifier only for legacy rows with no date. */}
            <AppText className="text-[13px] font-bold text-default">
              {dateLabel ?? `Session ${session.session_id}`}
            </AppText>
            {/* Active sessions get a Live pill; finalized sessions show just the
                date header — the game count lives in the footer, not here. */}
            {isActive && (
              <View
                testID={`session-card-${session.session_id}-live-pill`}
                className="self-start mt-[3px] flex-row items-center bg-status-live-tint rounded-[6px] px-[8px] py-[2px]"
              >
                <View className="w-[6px] h-[6px] rounded-full bg-status-live-fill mr-[5px]" />
                <AppText className="text-[10px] font-bold text-status-live uppercase tracking-wide">
                  Live
                </AppText>
              </View>
            )}
          </View>
          <ChevronRightIcon size={18} color={palette.textMuted} />
        </Pressable>

        {/* Game rows */}
        {session.mode === "mine"
          ? session.myGames.map((g) => (
              <MyGameRow key={g.id} game={g} hideRatingChange={isActive} />
            ))
          : session.allGames.map((g) => <AllGameRow key={g.id} game={g} />)}

        {/* Footer stats */}
        <View className="flex-row px-4 py-[12px] gap-4 border-t border-divider">
          <View>
            <AppText className="text-[11px] text-tertiary uppercase tracking-wide">
              {session.mode === "mine" ? "Your Games" : "Games"}
            </AppText>
            <AppText
              testID={`session-card-${session.session_id}-game-count`}
              className="text-[14px] font-bold text-default"
            >
              {gameCount}
            </AppText>
          </View>

          {session.mode === "all" && (
            <View>
              <AppText className="text-[11px] text-tertiary uppercase tracking-wide">
                Players
              </AppText>
              <AppText
                testID={`session-card-${session.session_id}-player-count`}
                className="text-[14px] font-bold text-default"
              >
                {session.playerCount}
              </AppText>
            </View>
          )}

          {session.mode === "mine" && !isActive && (
            <>
              <View>
                <AppText className="text-[11px] text-tertiary uppercase tracking-wide">
                  W-L
                </AppText>
                <AppText className="text-[14px] font-bold text-default">
                  {session.userWins}-{session.userLosses}
                </AppText>
              </View>
              <View>
                <AppText className="text-[11px] text-tertiary uppercase tracking-wide">
                  Rating
                </AppText>
                <AppText
                  className={`text-[14px] font-bold ${
                    totalRating > 0
                      ? "text-success"
                      : totalRating < 0
                        ? "text-danger"
                        : "text-muted"
                  }`}
                >
                  {totalRating > 0 ? "+" : ""}
                  {totalRating}
                </AppText>
              </View>
            </>
          )}

          {session.mode === "mine" && isActive && (
            <View>
              <AppText className="text-[11px] text-tertiary uppercase tracking-wide">
                Status
              </AppText>
              <AppText className="text-[14px] font-bold text-status-live">
                In progress
              </AppText>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Segmented toggle
// ---------------------------------------------------------------------------

interface ModeToggleProps {
  readonly mode: LeagueMatchesMode;
  readonly myGameCount: number;
  readonly allGameCount: number;
  readonly onChange: (mode: LeagueMatchesMode) => void;
}

function ModeToggle({
  mode,
  myGameCount,
  allGameCount,
  onChange,
}: ModeToggleProps): React.ReactNode {
  const handlePress = (next: LeagueMatchesMode) => {
    if (next === mode) return;
    void hapticLight();
    onChange(next);
  };

  return (
    <View
      testID="league-games-mode-toggle"
      className="flex-row bg-elevated border border-divider rounded-[10px] mx-4 mt-2 mb-2 p-[3px]"
    >
      <TouchableOpacity
        testID="league-games-mode-mine"
        onPress={() => {
          handlePress("mine");
        }}
        className={`flex-1 flex-row items-center justify-center gap-[6px] py-[6px] rounded-[8px] ${mode === "mine" ? "bg-brand-teal" : ""}`}
      >
        <AppText
          className={`text-[12px] font-semibold ${mode === "mine" ? "text-on-brand-teal" : "text-muted"}`}
        >
          My Games
        </AppText>
        {myGameCount > 0 && (
          <AppText
            className={`text-[11px] font-bold ${mode === "mine" ? "text-on-brand-teal" : "text-muted"}`}
          >
            {myGameCount}
          </AppText>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        testID="league-games-mode-all"
        onPress={() => {
          handlePress("all");
        }}
        className={`flex-1 flex-row items-center justify-center gap-[6px] py-[6px] rounded-[8px] ${mode === "all" ? "bg-brand-teal" : ""}`}
      >
        <AppText
          className={`text-[12px] font-semibold ${mode === "all" ? "text-on-brand-teal" : "text-muted"}`}
        >
          All Games
        </AppText>
        {allGameCount > 0 && (
          <AppText
            className={`text-[11px] font-bold ${mode === "all" ? "text-on-brand-teal" : "text-muted"}`}
          >
            {allGameCount}
          </AppText>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface LeagueMatchesTabProps {
  readonly leagueId: number | string;
}

export default function LeagueMatchesTab({
  leagueId,
}: LeagueMatchesTabProps): React.ReactNode {
  const {
    mode,
    setMode,
    sessions,
    myGameCount,
    allGameCount,
    isLoading,
    isError,
  } = useLeagueMatchesTab(leagueId);

  // The toggle should stay visible even while data loads/errors.
  const toggle = (
    <ModeToggle
      mode={mode}
      myGameCount={myGameCount}
      allGameCount={allGameCount}
      onChange={setMode}
    />
  );

  if (isLoading) {
    return (
      <View className="flex-1 bg-page">
        {toggle}
        <View
          testID="matches-loading"
          className="flex-1 items-center justify-center"
        >
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 bg-page">
        {toggle}
        <View
          testID="matches-error"
          className="flex-1 items-center justify-center px-8"
        >
          <AppText className="text-[16px] font-bold text-default text-center">
            Failed to load games
          </AppText>
        </View>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View className="flex-1 bg-page">
        {toggle}
        <View
          testID="matches-empty"
          className="flex-1 items-center justify-center px-8 py-16"
        >
          <AppText className="text-[18px] font-bold text-default mb-2 text-center">
            {mode === "mine" ? "No Games Yet" : "No League Games Yet"}
          </AppText>
          <AppText className="text-[14px] text-muted text-center">
            {mode === "mine"
              ? "Your games will appear here after sessions are submitted."
              : "League games will appear here as sessions are played."}
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-page">
      {toggle}
      <ScrollView
        testID="matches-tab"
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
      >
        {sessions.map((s) => (
          <SessionCard key={s.session_id} session={s} />
        ))}
      </ScrollView>
    </View>
  );
}
