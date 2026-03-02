"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useAuthModal } from "../../contexts/AuthModalContext";
import {
  getKobTournament,
  addKobPlayer,
  removeKobPlayer,
  reorderKobSeeds,
  startKobTournament,
  deleteKobTournament,
  getPlayers,
} from "../../services/api";
import { Button } from "../ui/UI";
import NavBar from "../layout/NavBar";
import { Loader2, Trophy, X, GripVertical, Search, Play, Trash2, Copy, Users } from "lucide-react";
import "./KobSetup.css";

export default function KobSetup({ tournamentId }) {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, isInitializing, logout } = useAuth();
  const { openAuthModal } = useAuthModal();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Player search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const searchDebounceRef = useRef(null);

  // Actions
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadTournament = useCallback(async () => {
    try {
      const data = await getKobTournament(tournamentId);
      setTournament(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (isAuthenticated) loadTournament();
  }, [isAuthenticated, loadTournament]);

  // Redirect to live page if already active
  useEffect(() => {
    if (tournament?.status === "ACTIVE" || tournament?.status === "COMPLETED") {
      router.push(`/kob/${tournament.code}`);
    }
  }, [tournament, router]);

  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    clearTimeout(searchDebounceRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await getPlayers({ q: query, limit: 10 });
        const results = data.items || data;
        // Filter out already-added players
        const existingIds = new Set(tournament.players.map((p) => p.player_id));
        setSearchResults(results.filter((r) => !existingIds.has(r.id)));
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [tournament]);

  const handleAddPlayer = async (playerId) => {
    try {
      const updated = await addKobPlayer(tournamentId, { player_id: playerId });
      setTournament(updated);
      setSearchQuery("");
      setSearchResults([]);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to add player");
    }
  };

  const handleRemovePlayer = async (playerId) => {
    try {
      const updated = await removeKobPlayer(tournamentId, playerId);
      setTournament(updated);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to remove player");
    }
  };

  const handleMovePlayer = async (index, direction) => {
    const players = [...tournament.players];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= players.length) return;

    [players[index], players[newIndex]] = [players[newIndex], players[index]];
    const orderedIds = players.map((p) => p.player_id);

    try {
      const updated = await reorderKobSeeds(tournamentId, orderedIds);
      setTournament(updated);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to reorder");
    }
  };

  const handleStart = async () => {
    if (!confirm("Start tournament? Roster will be locked and matches generated.")) return;
    setStarting(true);
    try {
      const updated = await startKobTournament(tournamentId);
      setTournament(updated);
      router.push(`/kob/${updated.code}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to start tournament");
    } finally {
      setStarting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this tournament? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteKobTournament(tournamentId);
      router.push("/home");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete tournament");
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyLink = () => {
    if (tournament?.code) {
      navigator.clipboard.writeText(`${window.location.origin}/kob/${tournament.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSignOut = async () => {
    try { await logout(); } catch { /* ignore */ }
    router.push("/");
  };

  if (isInitializing || loading) {
    return (
      <div className="kob-setup__loading">
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
        <div className="kob-setup__auth-prompt">
          <p>Sign in to manage tournaments</p>
          <Button onClick={() => openAuthModal("sign-in")}>Sign In</Button>
        </div>
      </>
    );
  }

  if (!tournament) {
    return (
      <>
        <NavBar isLoggedIn={isAuthenticated} user={user} currentUserPlayer={currentUserPlayer} onSignOut={handleSignOut} onSignIn={() => openAuthModal("sign-in")} onSignUp={() => openAuthModal("sign-up")} />
        <div className="kob-setup__error-page">
          <p>{error || "Tournament not found"}</p>
          <Button onClick={() => router.push("/home")}>Go Home</Button>
        </div>
      </>
    );
  }

  const playerCount = tournament.players?.length || 0;
  const canStart = playerCount >= 4;

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

      <div className="kob-setup">
        <div className="kob-setup__header">
          <div className="kob-setup__header-top">
            <div>
              <h1 className="kob-setup__title">{tournament.name}</h1>
              <p className="kob-setup__subtitle">
                {tournament.gender === "mens" ? "King" : "Queen"} of the Beach
                {" · "}{tournament.format?.replace(/_/g, " ").toLowerCase()}
                {" · "}Game to {tournament.game_to}
              </p>
            </div>
            <div className="kob-setup__code-badge" onClick={handleCopyLink} title="Copy link">
              <Copy size={14} />
              <span>{tournament.code}</span>
              {copied && <span className="kob-setup__copied">Copied!</span>}
            </div>
          </div>
        </div>

        {/* Player roster */}
        <div className="kob-setup__section">
          <div className="kob-setup__section-header">
            <Users size={18} style={{ color: "var(--primary)" }} />
            <h2 className="kob-setup__section-title">Players ({playerCount})</h2>
          </div>

          {/* Search to add */}
          <div className="kob-setup__search-wrapper">
            <button
              type="button"
              className="kob-setup__add-btn"
              onClick={() => setShowSearch(!showSearch)}
            >
              {showSearch ? "Cancel" : "+ Add Player"}
            </button>

            {showSearch && (
              <div className="kob-setup__search">
                <div className="kob-setup__search-input-wrapper">
                  <Search size={16} />
                  <input
                    type="text"
                    className="kob-setup__search-input"
                    placeholder="Search players by name..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {searching && (
                  <div className="kob-setup__search-loading">
                    <Loader2 size={14} className="spin" />
                  </div>
                )}
                {searchResults.length > 0 && (
                  <div className="kob-setup__search-results">
                    {searchResults.slice(0, 10).map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className="kob-setup__search-result"
                        onClick={() => handleAddPlayer(player.id)}
                      >
                        <span className="kob-setup__search-result-name">{player.full_name}</span>
                        <span className="kob-setup__search-result-add">Add</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Player list */}
          {tournament.players?.length > 0 ? (
            <div className="kob-setup__player-list">
              {tournament.players.map((p, idx) => (
                <div key={p.player_id} className="kob-setup__player-row">
                  <div className="kob-setup__player-left">
                    <span className="kob-setup__seed">{idx + 1}</span>
                    <div className="kob-setup__player-reorder">
                      <button
                        type="button"
                        className="kob-setup__reorder-btn"
                        onClick={() => handleMovePlayer(idx, -1)}
                        disabled={idx === 0}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="kob-setup__reorder-btn"
                        onClick={() => handleMovePlayer(idx, 1)}
                        disabled={idx === tournament.players.length - 1}
                      >
                        ▼
                      </button>
                    </div>
                    <span className="kob-setup__player-name">{p.player_name || `Player ${p.player_id}`}</span>
                  </div>
                  <button
                    type="button"
                    className="kob-setup__remove-btn"
                    onClick={() => handleRemovePlayer(p.player_id)}
                    title="Remove"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="kob-setup__empty">
              <p>No players added yet. Search to add players.</p>
            </div>
          )}
        </div>

        {error && <p className="kob-setup__error">{error}</p>}

        {/* Actions */}
        <div className="kob-setup__actions">
          <Button
            onClick={handleStart}
            disabled={!canStart || starting}
            style={{ flex: 1 }}
          >
            {starting ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <>
                <Play size={16} />
                Start Tournament ({playerCount} players)
              </>
            )}
          </Button>
        </div>

        {!canStart && playerCount > 0 && (
          <p className="kob-setup__min-warning">Need at least 4 players to start</p>
        )}

        <div className="kob-setup__danger-zone">
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 size={16} className="spin" /> : <><Trash2 size={14} /> Delete Tournament</>}
          </Button>
        </div>
      </div>
    </>
  );
}
