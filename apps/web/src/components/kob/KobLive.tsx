"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useAuthModal } from "../../contexts/AuthModalContext";
import {
  getKobTournamentByCode,
  submitKobScorePublic,
  advanceKobRound,
  dropKobPlayer,
  editKobScore,
  completeKobTournament,
} from "../../services/api";
import { Button } from "../ui/UI";
import NavBar from "../layout/NavBar";
import NowPlayingTab from "./NowPlayingTab";
import StandingsTab from "./StandingsTab";
import ScheduleTab from "./ScheduleTab";
import DirectorControls from "./DirectorControls";
import { Loader2, Trophy, Share2, Copy } from "lucide-react";
import "./KobLive.css";

const POLL_INTERVAL_MS = 5000;

interface KobLiveProps {
  code: string;
}

export default function KobLive({ code }: KobLiveProps) {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, isInitializing, logout } = useAuth();
  const { openAuthModal } = useAuthModal();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("now-playing");
  const [copied, setCopied] = useState(false);

  const pollRef = useRef(null);

  const loadTournament = useCallback(async () => {
    try {
      const data = await getKobTournamentByCode(code);
      setTournament(data);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Initial load
  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  // Poll when active
  useEffect(() => {
    if (tournament?.status === "ACTIVE") {
      pollRef.current = setInterval(loadTournament, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tournament?.status, loadTournament]);

  const handleScoreSubmit = async (matchupId: number, team1Score: number, team2Score: number) => {
    await submitKobScorePublic(code, String(matchupId), {
      team1_score: team1Score,
      team2_score: team2Score,
    });
    // Optimistic: reload immediately
    await loadTournament();
  };

  const isDirector = isAuthenticated && tournament?.director_player_id === currentUserPlayer?.id;

  const handleDirectorAdvance = async () => {
    try {
      await advanceKobRound(tournament.id);
      await loadTournament();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to advance round");
    }
  };

  const handleDirectorDrop = async (playerId: number) => {
    try {
      await dropKobPlayer(tournament.id, playerId);
      await loadTournament();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to drop player");
    }
  };

  const handleDirectorEditScore = async (matchupId: number, team1Score: number, team2Score: number) => {
    try {
      await editKobScore(tournament.id, String(matchupId), {
        team1_score: team1Score,
        team2_score: team2Score,
      });
      await loadTournament();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to edit score");
    }
  };

  const handleDirectorComplete = async () => {
    if (!confirm("Complete this tournament? No more scores can be entered.")) return;
    try {
      await completeKobTournament(tournament.id);
      await loadTournament();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to complete tournament");
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.name, url });
      } catch { /* cancelled */ }
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSignOut = async () => {
    try { await logout(); } catch { /* ignore */ }
    router.push("/");
  };

  if (loading) {
    return (
      <div className="kob-live__loading">
        <Loader2 size={32} className="spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  if (error || !tournament) {
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
        <div className="kob-live__error">
          <Trophy size={48} style={{ color: "var(--gray-300)" }} />
          <h2>Tournament Not Found</h2>
          <p>{error || "This tournament doesn't exist or the code is invalid."}</p>
        </div>
      </>
    );
  }

  const currentRoundMatches = tournament.matches?.filter(
    (m: any) => m.round_num === tournament.current_round
  ) || [];

  // Compute display label for current round (e.g. "Round 3" or "Playoff 2" or "Final")
  const currentRoundLabel = (() => {
    if (!tournament.current_round) return null;
    const match = currentRoundMatches[0];
    if (match?.bracket_position === "final") return "Final";
    if (match?.bracket_position === "semifinal") return "Semifinal";
    if (tournament.current_phase === "playoffs") {
      // Count how many pool play rounds there are
      const poolPlayRounds = new Set(
        (tournament.matches || []).filter((m: any) => m.phase === "pool_play").map((m: any) => m.round_num)
      ).size;
      return `Playoff ${tournament.current_round - poolPlayRounds}`;
    }
    return `Round ${tournament.current_round}`;
  })();

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

      <div className="kob-live">
        {/* Header */}
        <div className="kob-live__header">
          <div className="kob-live__header-top">
            <div>
              <h1 className="kob-live__title">{tournament.name}</h1>
              <div className="kob-live__meta">
                <span className={`kob-live__status kob-live__status--${tournament.status.toLowerCase()}`}>
                  {tournament.status}
                </span>
                {currentRoundLabel && (
                  <span className="kob-live__round">{currentRoundLabel}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              className="kob-live__share-btn"
              onClick={handleShare}
              title="Share"
            >
              {copied ? <Copy size={18} /> : <Share2 size={18} />}
              <span>{copied ? "Copied!" : "Share"}</span>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="kob-live__tabs">
          <button
            type="button"
            className={`kob-live__tab ${activeTab === "now-playing" ? "kob-live__tab--active" : ""}`}
            onClick={() => setActiveTab("now-playing")}
          >
            Now Playing
          </button>
          <button
            type="button"
            className={`kob-live__tab ${activeTab === "standings" ? "kob-live__tab--active" : ""}`}
            onClick={() => setActiveTab("standings")}
          >
            Standings
          </button>
          <button
            type="button"
            className={`kob-live__tab ${activeTab === "schedule" ? "kob-live__tab--active" : ""}`}
            onClick={() => setActiveTab("schedule")}
          >
            Schedule
          </button>
        </div>

        {/* Tab content */}
        <div className="kob-live__content">
          {activeTab === "now-playing" && (
            <NowPlayingTab
              matches={currentRoundMatches}
              tournament={tournament}
              onScoreSubmit={handleScoreSubmit}
              isDirector={isDirector}
              onEditScore={handleDirectorEditScore}
            />
          )}
          {activeTab === "standings" && (
            <StandingsTab
              standings={tournament.standings}
              pools={tournament.schedule_data?.pools}
              players={tournament.players}
              status={tournament.status}
            />
          )}
          {activeTab === "schedule" && (
            <ScheduleTab
              matches={tournament.matches}
              scheduleData={tournament.schedule_data}
              currentRound={tournament.current_round}
            />
          )}
        </div>

        {/* Director controls */}
        {isDirector && tournament.status === "ACTIVE" && (
          <DirectorControls
            tournament={tournament}
            onAdvance={handleDirectorAdvance}
            onDropPlayer={handleDirectorDrop}
            onComplete={handleDirectorComplete}
          />
        )}
      </div>
    </>
  );
}
