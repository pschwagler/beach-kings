"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useAuthModal } from "../../contexts/AuthModalContext";
import { useToast } from "../../contexts/ToastContext";
import { createKobTournament, getKobFormatRecommendation } from "../../services/api";
import { Button } from "../ui/UI";
import NavBar from "../layout/NavBar";
import KobPreview from "./KobPreview";
import { Loader2, Trophy } from "lucide-react";
import "./KobCreate.css";

const FORMAT_OPTIONS = [
  { value: "FULL_ROUND_ROBIN", label: "Round Robin" },
  { value: "PARTIAL_ROUND_ROBIN", label: "Limited Rounds" },
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
  { value: 90, label: "1.5h" },
  { value: 120, label: "2h" },
  { value: 150, label: "2.5h" },
  { value: 180, label: "3h" },
  { value: 210, label: "3.5h" },
  { value: 240, label: "4h" },
  { value: 300, label: "5h" },
];

export default function KobCreate() {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, isInitializing, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { showToast } = useToast();
  const nameInputRef = useRef(null);

  // Form state
  const [name, setName] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [numPlayers, setNumPlayers] = useState(8);
  const [numCourts, setNumCourts] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [autoAdvance, setAutoAdvance] = useState(true);

  // Format state
  const [format, setFormat] = useState("FULL_ROUND_ROBIN");
  const [userPickedFormat, setUserPickedFormat] = useState(false);
  const userPickedFormatRef = useRef(false);

  // Format-dependent config
  const [numPools, setNumPools] = useState(null);
  const [playoffSize, setPlayoffSize] = useState(0);
  const [maxRounds, setMaxRounds] = useState(5);

  // Game settings
  const [gameTo, setGameTo] = useState(21);
  const [capEnabled, setCapEnabled] = useState(false);
  const [scoreCap, setScoreCap] = useState(25); // default = gameTo + 4
  const [gamesPerMatch, setGamesPerMatch] = useState(1);

  // Playoff-specific settings
  const [playoffFormat, setPlayoffFormat] = useState(null); // null = RR, "DRAFT"
  const [customPlayoffSettings, setCustomPlayoffSettings] = useState(false);
  const [playoffGameTo, setPlayoffGameTo] = useState(null); // null = use tournament gameTo
  const [playoffGamesPerMatch, setPlayoffGamesPerMatch] = useState(null); // null = use tournament gpm
  const [playoffCapEnabled, setPlayoffCapEnabled] = useState(false);
  const [playoffScoreCap, setPlayoffScoreCap] = useState(null);

  // Recommendation / preview
  const [recommendation, setRecommendation] = useState(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const debounceRef = useRef(null);

  // Metadata
  const [gender, setGender] = useState("coed");

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Derived
  const poolSize = numPools ? Math.ceil(numPlayers / numPools) : null;
  const effectiveFormat = format || recommendation?.format || "FULL_ROUND_ROBIN";
  const isPools = effectiveFormat === "POOLS_PLAYOFFS";
  // For pools, playoffs are always on — enforce minimum Top 4
  const effectivePlayoffSize = isPools ? Math.max(playoffSize, 4) : playoffSize;

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
      const params = {
        numPlayers,
        numCourts,
        gameTo,
        gamesPerMatch,
        durationMinutes: durationMinutes || undefined,
        playoffFormat: playoffFormat || undefined,
        playoffGameTo: customPlayoffSettings ? playoffGameTo : undefined,
        playoffGamesPerMatch: customPlayoffSettings ? playoffGamesPerMatch : undefined,
      };

      if (userPickedFormat && format) {
        params.format = format;
        if (format === "POOLS_PLAYOFFS") {
          if (numPools) params.numPools = numPools;
        }
        if (format === "PARTIAL_ROUND_ROBIN" && maxRounds) {
          params.maxRounds = maxRounds;
        }
      }

      // Send playoff size for any format
      const ps = (format === "POOLS_PLAYOFFS" || isPools) ? Math.max(effectivePlayoffSize, 4) : effectivePlayoffSize;
      if (ps > 0) params.playoffSize = ps;

      const rec = await getKobFormatRecommendation(params);
      setRecommendation(rec);

      // Sync UI from backend defaults — use ref to avoid stale closure
      if (!userPickedFormatRef.current) {
        setFormat(rec.format);
        setNumPools(rec.num_pools);
        setPlayoffSize(rec.playoff_size ?? 0);
        setMaxRounds(rec.max_rounds || 5);
        setGameTo(rec.game_to || 21);
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchRecommendation, 300);
    return () => clearTimeout(debounceRef.current);
  }, [fetchRecommendation]);

  // If player count drops below 8 while Pools is selected, switch to RR
  useEffect(() => {
    if (numPlayers < 8 && format === "POOLS_PLAYOFFS") {
      setFormat("FULL_ROUND_ROBIN");
    }
  }, [numPlayers, format]);

  // Stepper helpers
  const stepPlayers = (delta) => setNumPlayers((prev) => Math.max(4, Math.min(40, prev + delta)));
  const stepCourts = (delta) => setNumCourts((prev) => Math.max(1, Math.min(20, prev + delta)));
  const stepPools = (delta) => { markOverride(); setNumPools((prev) => Math.max(2, Math.min(6, (prev || 2) + delta))); };
  const stepMaxRounds = (delta) => { markOverride(); setMaxRounds((prev) => Math.max(3, Math.min(20, (prev || 5) + delta))); };

  /** Mark that the user has manually changed a setting. */
  const markOverride = () => {
    setUserPickedFormat(true);
    userPickedFormatRef.current = true;
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
    // The next fetchRecommendation will auto-fill format, pools, etc.
  };

  // Format selection handler
  const handleFormatSelect = (f) => {
    setFormat(f);
    markOverride();

    if (f === "POOLS_PLAYOFFS") {
      if (!numPools) setNumPools(Math.min(numCourts, 3));
      if (playoffSize < 4) setPlayoffSize(4);
    }
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
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Failed to create tournament");
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
                    <span className="kob-create__stepper-value">{numPlayers}</span>
                    <button type="button" className="kob-create__stepper-btn" onClick={() => stepPlayers(1)}>+</button>
                  </div>
                </div>
                <div className="kob-create__row-item">
                  <label className="kob-create__label">Courts</label>
                  <div className="kob-create__stepper">
                    <button type="button" className="kob-create__stepper-btn" onClick={() => stepCourts(-1)}>-</button>
                    <span className="kob-create__stepper-value">{numCourts}</span>
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

              <div className="kob-create__divider" />

              {/* Format */}
              <div className="kob-create__label-row">
                <label className="kob-create__label">Format</label>
                {userPickedFormat && durationMinutes && (
                  <button
                    type="button"
                    className="kob-create__reset-link"
                    onClick={handleResetToSuggested}
                  >
                    Reset to suggested
                  </button>
                )}
              </div>
              {userPickedFormat && durationMinutes && (
                <p className="kob-create__format-hint">
                  Auto-picks the best format for your {DURATION_OPTIONS.find((o) => o.value === durationMinutes)?.label || "duration"}
                </p>
              )}
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
                      <button type="button" className="kob-create__stepper-btn" onClick={() => stepPools(-1)}>-</button>
                      <span className="kob-create__stepper-value">{numPools || 2}</span>
                      <button type="button" className="kob-create__stepper-btn" onClick={() => stepPools(1)}>+</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Conditional: Partial RR */}
              {effectiveFormat === "PARTIAL_ROUND_ROBIN" && (
                <div className="kob-create__conditional">
                  <div className="kob-create__row-item">
                    <label className="kob-create__label">Max Rounds</label>
                    <div className="kob-create__stepper">
                      <button type="button" className="kob-create__stepper-btn" onClick={() => stepMaxRounds(-1)}>-</button>
                      <span className="kob-create__stepper-value">{maxRounds}</span>
                      <button type="button" className="kob-create__stepper-btn" onClick={() => stepMaxRounds(1)}>+</button>
                    </div>
                  </div>
                </div>
              )}

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
                    onClick={() => { markOverride(); setPlayoffSize(opt.value); }}
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
                        onClick={() => setPlayoffFormat(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

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
                            {val === 3 ? "Bo3" : "1"}
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
                    Games/matchup
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
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="coed">Coed</option>
                    <option value="mens">Men&apos;s</option>
                    <option value="womens">Women&apos;s</option>
                  </select>
                </div>
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
              <KobPreview recommendation={recommendation} loading={loadingRec} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
