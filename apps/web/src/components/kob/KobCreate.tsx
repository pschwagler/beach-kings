"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useAuthModal } from "../../contexts/AuthModalContext";
import { useModal, MODAL_TYPES } from "../../contexts/ModalContext";
import { useToast } from "../../contexts/ToastContext";
import { createKobTournament, getKobFormatRecommendation, getKobFormatPills } from "../../services/api";
import { Button } from "../ui/UI";
import NavBar from "../layout/NavBar";
import KobPreview from "./KobPreview";
import { Loader2, Trophy } from "lucide-react";
import "./KobCreate.css";

/** A pre-computed format option returned by the pills endpoint. */
interface KobPill {
  format: string;
  num_pools: number | null;
  playoff_size: number | null;
  max_rounds: number | null;
  game_to: number;
  games_per_match: number;
  playoff_format: string | null;
  is_recommended: boolean;
  label: string;
  total_time_minutes: number;
  max_games_per_player: number;
}

/** Recommendation / preview shape returned by the recommendation endpoint. */
interface KobRecommendationConfig {
  format: string;
  num_pools: number | null;
  playoff_size: number | null;
  max_rounds: number | null;
  game_to: number;
  games_per_match: number;
  playoff_format: string | null;
  suggestion?: string | null;
  [key: string]: unknown;
}

const FORMAT_OPTIONS = [
  { value: "FULL_ROUND_ROBIN", label: "Round Robin" },
  { value: "PARTIAL_ROUND_ROBIN", label: "Partial RR" },
  { value: "POOLS_PLAYOFFS", label: "Pools" },
];

const GAME_TO_OPTIONS = [28, 21, 15, 11, 7];

const PLAYOFF_FORMAT_OPTIONS = [
  { value: null, label: "Round Robin" },
  { value: "DRAFT", label: "Team Playoff" },
];

const PLAYOFF_SIZE_OPTIONS_WITH_OFF = [
  { value: 0, label: "Off" },
  { value: 4, label: "Top 4" },
  { value: 6, label: "Top 6" },
];

const PLAYOFF_SIZE_OPTIONS_NO_OFF = [
  { value: 4, label: "Top 4" },
  { value: 6, label: "Top 6" },
];

const DURATION_OPTIONS = [
  { value: null, label: "No limit" },
  { value: 90, label: "1:30" },
  { value: 120, label: "2:00" },
  { value: 150, label: "2:30" },
  { value: 180, label: "3:00" },
  { value: 210, label: "3:30" },
  { value: 240, label: "4:00" },
  { value: 300, label: "5:00" },
  { value: 360, label: "6:00" },
  { value: 420, label: "7:00" },
  { value: 480, label: "8:00" },
];

export default function KobCreate() {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, isInitializing, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const { showToast } = useToast();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const userChangedGenderRef = useRef(false);

  // Form state
  const [name, setName] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [numPlayers, setNumPlayers] = useState(8);
  const [numCourts, setNumCourts] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(180);
  const [autoAdvance, setAutoAdvance] = useState(true);

  // Format state
  const [format, setFormat] = useState("FULL_ROUND_ROBIN");
  const [userPickedFormat, setUserPickedFormat] = useState(false);
  const userPickedFormatRef = useRef(false);

  // Format-dependent config
  const [numPools, setNumPools] = useState<number | null>(null);
  const [playoffSize, setPlayoffSize] = useState(0);
  const [maxRounds, setMaxRounds] = useState(5);

  // Game settings
  const [gameTo, setGameTo] = useState(21);
  const [capEnabled, setCapEnabled] = useState(false);
  const [scoreCap, setScoreCap] = useState(25); // default = gameTo + 4
  const [gamesPerMatch, setGamesPerMatch] = useState(1);

  // Playoff-specific settings
  const [playoffFormat, setPlayoffFormat] = useState<string | null>(null); // null = RR, "DRAFT"
  const [customPlayoffSettings, setCustomPlayoffSettings] = useState(false);
  const [playoffGameTo, setPlayoffGameTo] = useState<number | null>(null); // null = use tournament gameTo
  const [playoffGamesPerMatch, setPlayoffGamesPerMatch] = useState<number | null>(null); // null = use tournament gpm
  const [playoffCapEnabled, setPlayoffCapEnabled] = useState(false);
  const [playoffScoreCap, setPlayoffScoreCap] = useState<number | null>(null);

  // Recommendation / preview
  const [recommendation, setRecommendation] = useState<KobRecommendationConfig | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Format pills
  const [pills, setPills] = useState<KobPill[]>([]);
  const [activePillIdx, setActivePillIdx] = useState<number | null>(null);
  const pillDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Metadata
  const [gender, setGender] = useState("coed");

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived
  const poolSize = numPools ? Math.ceil(numPlayers / numPools) : null;
  const effectiveFormat = format || recommendation?.format || "FULL_ROUND_ROBIN";
  const isPools = effectiveFormat === "POOLS_PLAYOFFS";
  // For pools, playoffs are always on — enforce minimum Top 4
  const effectivePlayoffSize = isPools ? Math.max(playoffSize, 4) : playoffSize;

  // Default gender to the creating player's gender
  useEffect(() => {
    if (userChangedGenderRef.current || !currentUserPlayer?.gender) return;
    const mapped = currentUserPlayer.gender === "male" ? "mens"
      : currentUserPlayer.gender === "female" ? "womens" : "coed";
    setGender(mapped);
  }, [currentUserPlayer]);

  // When gameTo changes, update default cap value
  useEffect(() => {
    if (!capEnabled) {
      setScoreCap(gameTo + 4);
    }
  }, [gameTo, capEnabled]);

  // Fetch recommendation/preview
  const fetchRecommendation = useCallback(async () => {
    if (numPlayers < 4) {
      setRecommendation(null);
      return;
    }
    setLoadingRec(true);
    try {
      const ps = (format === "POOLS_PLAYOFFS" || isPools) ? Math.max(effectivePlayoffSize, 4) : effectivePlayoffSize;

      const params: Parameters<typeof getKobFormatRecommendation>[0] = {
        numPlayers,
        numCourts,
        gameTo,
        gamesPerMatch,
        durationMinutes: durationMinutes || undefined,
        playoffFormat: playoffFormat || undefined,
        playoffGameTo: customPlayoffSettings ? (playoffGameTo ?? undefined) : undefined,
        playoffGamesPerMatch: customPlayoffSettings ? (playoffGamesPerMatch ?? undefined) : undefined,
        ...(userPickedFormat && format ? { format } : {}),
        ...(userPickedFormat && format === "POOLS_PLAYOFFS" && numPools ? { numPools } : {}),
        ...(userPickedFormat && format === "PARTIAL_ROUND_ROBIN" && maxRounds ? { maxRounds } : {}),
        ...(ps > 0 ? { playoffSize: ps } : {}),
      };

      const rec = await getKobFormatRecommendation(params) as KobRecommendationConfig;
      setRecommendation(rec);

      // Sync UI from backend defaults — use ref to avoid stale closure
      if (!userPickedFormatRef.current) {
        setFormat(rec.format);
        setNumPools(rec.num_pools);
        setPlayoffSize(rec.playoff_size ?? 0);
        setMaxRounds(rec.max_rounds || 5);
        setGameTo(rec.game_to || 21);
        setGamesPerMatch(rec.games_per_match || 1);
        setPlayoffFormat(rec.playoff_format || null);
      }
    } catch {
      // Silent fail — preview is non-critical
    } finally {
      setLoadingRec(false);
    }
  }, [numPlayers, numCourts, format, numPools, effectivePlayoffSize, maxRounds,
      gameTo, gamesPerMatch, userPickedFormat, isPools, durationMinutes,
      playoffFormat, playoffGameTo, playoffGamesPerMatch, customPlayoffSettings]);

  // Debounced fetch on any config change
  useEffect(() => {
    let cancelled = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (cancelled) return;
      await fetchRecommendation();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current ?? undefined);
    };
  }, [fetchRecommendation]);

  // Fetch pills when tournament shape changes (debounced separately)
  useEffect(() => {
    if (numPlayers < 4) {
      setPills([]);
      setActivePillIdx(null);
      return;
    }
    if (pillDebounceRef.current) clearTimeout(pillDebounceRef.current);
    pillDebounceRef.current = setTimeout(async () => {
      try {
        const result = await getKobFormatPills({
          numPlayers,
          numCourts,
          durationMinutes: durationMinutes || undefined,
        }) as KobPill[];
        setPills(result);
        // Auto-select recommended pill when user hasn't manually picked format
        if (!userPickedFormatRef.current) {
          const recIdx = result.findIndex((p: KobPill) => p.is_recommended);
          setActivePillIdx(recIdx >= 0 ? recIdx : null);
        } else {
          setActivePillIdx(null);
        }
      } catch {
        // Silent fail — pills are non-critical
      }
    }, 350);
    return () => clearTimeout(pillDebounceRef.current ?? undefined);
  }, [numPlayers, numCourts, durationMinutes]);

  // If player count drops below 8 while Pools is selected, switch to RR
  useEffect(() => {
    if (numPlayers < 8 && format === "POOLS_PLAYOFFS") {
      setFormat("FULL_ROUND_ROBIN");
    }
  }, [numPlayers, format]);

  // Stepper helpers
  const stepPlayers = (delta: number) => setNumPlayers((prev) => Math.max(4, Math.min(36, prev + delta)));
  const stepCourts = (delta: number) => setNumCourts((prev) => Math.max(1, Math.min(6, prev + delta)));
  const maxPools = Math.min(6, Math.floor(numPlayers / 4));
  const stepPools = (delta: number) => { markOverride(); setNumPools((prev: number | null) => Math.max(2, Math.min(maxPools, (prev || 2) + delta))); };
  const stepMaxRounds = (delta: number) => { markOverride(); setMaxRounds((prev: number | null) => Math.max(3, Math.min(20, (prev || 5) + delta))); };

  /** Mark that the user has manually changed a setting. */
  const markOverride = () => {
    setUserPickedFormat(true);
    userPickedFormatRef.current = true;
    setActivePillIdx(null);
  };

  /** Reset to auto-suggested settings for the current duration. */
  const handleResetToSuggested = () => {
    setUserPickedFormat(false);
    userPickedFormatRef.current = false;
    setGameTo(21);
    setGamesPerMatch(1);
    setCapEnabled(false);
    setPlayoffFormat(null);
    setCustomPlayoffSettings(false);
    // Re-select recommended pill
    const recIdx = pills.findIndex((p) => p.is_recommended);
    setActivePillIdx(recIdx >= 0 ? recIdx : null);
    // The next fetchRecommendation will auto-fill format, pools, etc.
  };

  // Format selection handler
  const handleFormatSelect = (f: string) => {
    setFormat(f);
    markOverride();

    if (f === "POOLS_PLAYOFFS") {
      if (!numPools) setNumPools(Math.min(numCourts, 3, Math.floor(numPlayers / 4)));
      if (playoffSize < 4) setPlayoffSize(4);
    }
  };

  // Pill click handler — populate form from pill config
  const handlePillClick = (pill: KobPill, idx: number) => {
    setActivePillIdx(idx);
    setFormat(pill.format);
    setNumPools(pill.num_pools);
    setPlayoffSize(pill.playoff_size ?? 0);
    setMaxRounds(pill.max_rounds || 5);
    setGameTo(pill.game_to || 21);
    setGamesPerMatch(pill.games_per_match || 1);
    setPlayoffFormat(pill.playoff_format || null);
    setUserPickedFormat(true);
    userPickedFormatRef.current = true;
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      nameInputRef.current?.focus();
      showToast("Give your tournament a name", "error");
      return;
    }
    if (recommendation?.suggestion) {
      if (!confirm(`${recommendation.suggestion}\n\nCreate anyway?`)) return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const tournament = await createKobTournament({
        name,
        gender,
        format: effectiveFormat,
        game_to: gameTo,
        num_courts: numCourts,
        max_rounds: effectiveFormat === "PARTIAL_ROUND_ROBIN" ? maxRounds : null,
        has_playoffs: effectivePlayoffSize > 0,
        playoff_size: effectivePlayoffSize > 0 ? effectivePlayoffSize : null,
        num_pools: isPools ? numPools : null,
        games_per_match: gamesPerMatch,
        score_cap: capEnabled ? scoreCap : null,
        playoff_format: playoffFormat || null,
        playoff_game_to: customPlayoffSettings ? playoffGameTo : null,
        playoff_games_per_match: customPlayoffSettings ? playoffGamesPerMatch : null,
        playoff_score_cap: customPlayoffSettings && playoffCapEnabled ? playoffScoreCap : null,
        auto_advance: autoAdvance,
        scheduled_date: scheduledDate || null,
      });
      router.push(`/kob/manage/${tournament.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || "Failed to create tournament");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try { await logout(); } catch { /* ignore */ }
    router.push("/");
  };

  if (isInitializing) {
    return (
      <div className="kob-create__loading">
        <Loader2 size={32} className="spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <NavBar
          isLoggedIn={false}
          onSignIn={() => openAuthModal("sign-in")}
          onSignUp={() => openAuthModal("sign-up")}
        />
        <div className="kob-create__auth-prompt">
          <Trophy size={48} style={{ color: "var(--primary)" }} />
          <h2>Sign in to create a tournament</h2>
          <Button onClick={() => openAuthModal("sign-in")}>Sign In</Button>
        </div>
      </>
    );
  }

  // Which playoff options to show
  const playoffOptions = isPools ? PLAYOFF_SIZE_OPTIONS_NO_OFF : PLAYOFF_SIZE_OPTIONS_WITH_OFF;

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal("sign-in")}
        onSignUp={() => openAuthModal("sign-up")}
      />

      <div className="kob-create">
        <div className="kob-create__header">
          <Trophy size={28} style={{ color: "var(--primary)" }} />
          <h1 className="kob-create__title">Create Tournament</h1>
        </div>

        <div className="kob-create__layout">
          {/* ── LEFT COLUMN: Form ── */}
          <div className="kob-create__form-col">
            <div className="kob-create__section">
              {/* Name */}
              <label className="kob-create__label">Tournament Name</label>
              <input
                ref={nameInputRef}
                type="text"
                className="kob-create__input"
                placeholder="e.g. Saturday KOB"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
              />

              {/* Players + Courts + Duration */}
              <div className="kob-create__row">
                <div className="kob-create__row-item">
                  <label className="kob-create__label">Players</label>
                  <div className="kob-create__stepper">
                    <button type="button" className="kob-create__stepper-btn" onClick={() => stepPlayers(-1)}>-</button>
                    <input
                      type="number"
                      className="kob-create__stepper-input"
                      value={numPlayers}
                      min={4}
                      max={36}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) setNumPlayers(v);
                      }}
                      onBlur={() => setNumPlayers((prev) => Math.max(4, Math.min(36, prev)))}
                    />
                    <button type="button" className="kob-create__stepper-btn" onClick={() => stepPlayers(1)}>+</button>
                  </div>
                </div>
                <div className="kob-create__row-item">
                  <label className="kob-create__label">Courts</label>
                  <div className="kob-create__stepper">
                    <button type="button" className="kob-create__stepper-btn" onClick={() => stepCourts(-1)}>-</button>
                    <input
                      type="number"
                      className="kob-create__stepper-input"
                      value={numCourts}
                      min={1}
                      max={6}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) setNumCourts(v);
                      }}
                      onBlur={() => setNumCourts((prev) => Math.max(1, Math.min(6, prev)))}
                    />
                    <button type="button" className="kob-create__stepper-btn" onClick={() => stepCourts(1)}>+</button>
                  </div>
                </div>
                <div className="kob-create__row-item">
                  <label className="kob-create__label">Duration</label>
                  <select
                    className="kob-create__duration-select"
                    value={durationMinutes ?? ""}
                    onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : null)}
                  >
                    {DURATION_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.value ?? ""}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Format pills */}
              {pills.length > 1 && (
                <div className="kob-create__pills">
                  {pills.map((pill, idx) => {
                    const hours = Math.floor(pill.total_time_minutes / 60);
                    const mins = pill.total_time_minutes % 60;
                    const timeStr = hours ? `${hours}h${mins ? ` ${mins}m` : ""}` : `${mins}m`;
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={`kob-create__pill${activePillIdx === idx ? " kob-create__pill--active" : ""}`}
                        onClick={() => handlePillClick(pill, idx)}
                      >
                        {pill.is_recommended && (
                          <span className="kob-create__pill-badge">Recommended</span>
                        )}
                        <span className="kob-create__pill-label">{pill.label}</span>
                        <span className="kob-create__pill-stats">
                          ~{timeStr} &middot; {pill.max_games_per_player} games/player
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="kob-create__divider" />

              {/* Format */}
              <div className="kob-create__label-row">
                <label className="kob-create__label">Format</label>
                {userPickedFormat && durationMinutes && activePillIdx === null && (
                  <button
                    type="button"
                    className="kob-create__reset-link"
                    onClick={handleResetToSuggested}
                  >
                    Reset to suggested for {DURATION_OPTIONS.find((o) => o.value === durationMinutes)?.label || "duration"}
                  </button>
                )}
              </div>
              <div className="kob-create__format-options">
                {FORMAT_OPTIONS.map((opt) => {
                  const poolsDisabled = opt.value === "POOLS_PLAYOFFS" && numPlayers < 8;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`kob-create__format-btn ${effectiveFormat === opt.value ? "kob-create__format-btn--active" : ""}`}
                      disabled={poolsDisabled}
                      onClick={() => handleFormatSelect(opt.value)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {numPlayers < 8 && !userPickedFormat && (
                <p className="kob-create__format-hint">Pools available with 8+ players</p>
              )}

              {/* Conditional: Pools */}
              {isPools && (
                <div className="kob-create__conditional">
                  <div className="kob-create__row-item">
                    <label className="kob-create__label">
                      Pools
                      {poolSize && <span className="kob-create__label-hint">(~{poolSize}/pool)</span>}
                    </label>
                    <div className="kob-create__stepper">
                      <button type="button" className="kob-create__stepper-btn" disabled={(numPools || 2) <= 2} onClick={() => stepPools(-1)}>-</button>
                      <span className="kob-create__stepper-value">{numPools || 2}</span>
                      <button type="button" className="kob-create__stepper-btn" disabled={(numPools || 2) >= maxPools} onClick={() => stepPools(1)}>+</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Conditional: Partial RR */}
              {effectiveFormat === "PARTIAL_ROUND_ROBIN" && (
                <div className="kob-create__conditional">
                  <div className="kob-create__row-item">
                    <label className="kob-create__label">Rounds</label>
                    <div className="kob-create__stepper">
                      <button type="button" className="kob-create__stepper-btn" onClick={() => stepMaxRounds(-1)}>-</button>
                      <span className="kob-create__stepper-value">{maxRounds}</span>
                      <button type="button" className="kob-create__stepper-btn" onClick={() => stepMaxRounds(1)}>+</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Game Settings */}
              <label className="kob-create__label">Game to</label>
              <div className="kob-create__toggle-group">
                {GAME_TO_OPTIONS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`kob-create__toggle-btn ${gameTo === val ? "kob-create__toggle-btn--active" : ""}`}
                    onClick={() => { markOverride(); setGameTo(val); }}
                  >
                    {val}
                  </button>
                ))}
              </div>

              {/* Score Cap — toggle + input */}
              <div className="kob-create__cap-row">
                <label className="kob-create__checkbox-label">
                  <input
                    type="checkbox"
                    checked={capEnabled}
                    onChange={(e) => {
                      setCapEnabled(e.target.checked);
                      if (e.target.checked) setScoreCap(gameTo + 4);
                    }}
                  />
                  Score cap (win by 2, max score)
                </label>
                {capEnabled && (
                  <input
                    type="number"
                    className="kob-create__cap-input"
                    value={scoreCap}
                    onChange={(e) => setScoreCap(Math.max(gameTo + 1, Number(e.target.value)))}
                    min={gameTo + 1}
                    max={99}
                  />
                )}
              </div>

              {/* Games per matchup (show for ≤12 players) */}
              {numPlayers <= 12 && (
                <div className="kob-create__row-item">
                  <label className="kob-create__label">
                    Games/match
                    <span className="kob-create__label-hint">(play each pair 1x or 2x)</span>
                  </label>
                  <div className="kob-create__toggle-group">
                    {[1, 2].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className={`kob-create__toggle-btn ${gamesPerMatch === val ? "kob-create__toggle-btn--active" : ""}`}
                        onClick={() => { markOverride(); setGamesPerMatch(val); }}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="kob-create__divider" />

              {/* Playoffs — separate section, forced on for Pools */}
              <label className="kob-create__label">
                Playoffs
                {isPools && <span className="kob-create__label-hint">(required for pools)</span>}
              </label>
              <div className="kob-create__toggle-group">
                {playoffOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`kob-create__toggle-btn ${effectivePlayoffSize === opt.value ? "kob-create__toggle-btn--active" : ""}`}
                    onClick={() => {
                      markOverride();
                      setPlayoffSize(opt.value);
                      if (opt.value >= 6) setPlayoffFormat("DRAFT");
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Playoff settings — shown when playoffs enabled */}
              {effectivePlayoffSize > 0 && (
                <div className="kob-create__conditional">
                  <label className="kob-create__label">Playoff Format</label>
                  <div className="kob-create__toggle-group">
                    {PLAYOFF_FORMAT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value || "rr"}
                        type="button"
                        className={`kob-create__toggle-btn ${playoffFormat === opt.value ? "kob-create__toggle-btn--active" : ""}`}
                        onClick={() => { markOverride(); setPlayoffFormat(opt.value); }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="kob-create__format-hint">
                    {playoffFormat === "DRAFT"
                      ? "Faster — 1\u20132 rounds. Players draft teams, winning team shares 1st place"
                      : "Top players play everyone in playoffs — single champion decided by record"}
                  </p>

                  <label className="kob-create__checkbox-label" style={{ marginTop: "8px" }}>
                    <input
                      type="checkbox"
                      checked={customPlayoffSettings}
                      onChange={(e) => {
                        setCustomPlayoffSettings(e.target.checked);
                        if (e.target.checked) {
                          if (!playoffGameTo) setPlayoffGameTo(gameTo);
                          if (!playoffGamesPerMatch) setPlayoffGamesPerMatch(gamesPerMatch);
                        }
                      }}
                    />
                    Custom playoff game settings
                  </label>

                  {customPlayoffSettings && (
                    <div className="kob-create__playoff-settings">
                      <label className="kob-create__label">Playoff game to</label>
                      <div className="kob-create__toggle-group">
                        {GAME_TO_OPTIONS.map((val) => (
                          <button
                            key={val}
                            type="button"
                            className={`kob-create__toggle-btn ${playoffGameTo === val ? "kob-create__toggle-btn--active" : ""}`}
                            onClick={() => setPlayoffGameTo(val)}
                          >
                            {val}
                          </button>
                        ))}
                      </div>

                      <label className="kob-create__label">Games/match</label>
                      <div className="kob-create__toggle-group">
                        {[1, 3].map((val) => (
                          <button
                            key={val}
                            type="button"
                            className={`kob-create__toggle-btn ${playoffGamesPerMatch === val ? "kob-create__toggle-btn--active" : ""}`}
                            onClick={() => setPlayoffGamesPerMatch(val)}
                          >
                            {val === 3 ? "Best of 3" : "1"}
                          </button>
                        ))}
                      </div>

                      <div className="kob-create__cap-row">
                        <label className="kob-create__checkbox-label">
                          <input
                            type="checkbox"
                            checked={playoffCapEnabled}
                            onChange={(e) => {
                              setPlayoffCapEnabled(e.target.checked);
                              if (e.target.checked) setPlayoffScoreCap((playoffGameTo || gameTo) + 4);
                            }}
                          />
                          Score cap
                        </label>
                        {playoffCapEnabled && (
                          <input
                            type="number"
                            className="kob-create__cap-input"
                            value={playoffScoreCap || ""}
                            onChange={(e) => setPlayoffScoreCap(Math.max((playoffGameTo || gameTo) + 1, Number(e.target.value)))}
                            min={(playoffGameTo || gameTo) + 1}
                            max={99}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="kob-create__divider" />

              {/* Date + Gender row */}
              <div className="kob-create__meta-row">
                <div className="kob-create__row-item">
                  <label className="kob-create__label">Date (optional)</label>
                  <input
                    type="date"
                    className="kob-create__input"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </div>
                <div className="kob-create__row-item kob-create__row-item--small">
                  <label className="kob-create__label">Gender</label>
                  <select
                    className="kob-create__gender-select"
                    value={gender}
                    onChange={(e) => { userChangedGenderRef.current = true; setGender(e.target.value); }}
                  >
                    <option value="coed">Coed</option>
                    <option value="mens">Men&apos;s</option>
                    <option value="womens">Women&apos;s</option>
                  </select>
                </div>
              </div>

              {gender === "coed" && (
                <p className="kob-create__coed-hint">
                  Matchups are randomly assigned regardless of gender.{" "}
                  <button
                    type="button"
                    className="kob-create__coed-feedback-link"
                    onClick={() => openModal(MODAL_TYPES.FEEDBACK)}
                  >
                    Have feedback? Let us know.
                  </button>
                </p>
              )}

              {/* Tiebreaker rules */}
              <div className="kob-create__tiebreaker-info">
                <span className="kob-create__tiebreaker-title">Tiebreakers</span>
                <span className="kob-create__tiebreaker-rules">
                  1. Wins &nbsp; 2. Point Differential
                </span>
                <span className="kob-create__tiebreaker-note">Ties broken by coin flip</span>
              </div>

              {/* Auto-advance */}
              <label className="kob-create__checkbox-label">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                />
                Auto-advance rounds when all scores entered
              </label>

              {error && <p className="kob-create__error">{error}</p>}

              <Button
                onClick={handleCreate}
                disabled={submitting || numPlayers < 4}
                style={{ marginTop: "8px", width: "100%" }}
              >
                {submitting ? <Loader2 size={16} className="spin" /> : "Create Tournament"}
              </Button>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Preview ── */}
          <div className="kob-create__preview-col">
            {numPlayers < 4 ? (
              <div className="kob-create__min-warning">
                Need at least 4 players for a tournament.
              </div>
            ) : (
              <KobPreview recommendation={recommendation as Parameters<typeof KobPreview>[0]['recommendation']} loading={loadingRec} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
