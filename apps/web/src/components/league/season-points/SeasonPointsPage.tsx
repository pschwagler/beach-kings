"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SeasonPointsData } from "@beach-kings/shared";
import { getSeasonPoints } from "../../../services/endpoints/seasonPoints";
import { useAuth } from "../../../contexts/AuthContext";
import { useAuthModal } from "../../../contexts/AuthModalContext";
import NavBar from "../../layout/NavBar";
import SeasonExplorer from "./SeasonExplorer";
import "./SeasonExplorer.css";

export default function SeasonPointsPage({
  leagueId,
  seasonId,
}: {
  leagueId: number;
  seasonId: number;
}) {
  const auth = useAuth();
  const { openAuthModal } = useAuthModal();
  const [retry, setRetry] = useState(0);
  const key = `${auth.user?.id}:${leagueId}:${seasonId}`;
  const requestKey = `${key}:${retry}`;
  const [response, setResponse] = useState<{
    key: string;
    data?: SeasonPointsData;
    error?: string;
  } | null>(null);
  const validSeason =
    Number.isSafeInteger(leagueId) &&
    leagueId > 0 &&
    Number.isSafeInteger(seasonId) &&
    seasonId > 0;
  const currentResponse = response?.key === requestKey ? response : null;
  const data = currentResponse?.data;
  const error = validSeason ? currentResponse?.error : "Season not found.";
  const loading = validSeason && !currentResponse;
  useEffect(() => {
    if (!auth.isAuthenticated || !validSeason) return;
    const controller = new AbortController();
    let active = true;
    getSeasonPoints(leagueId, seasonId, controller.signal)
      .then((data) => {
        if (active) setResponse({ key: requestKey, data });
      })
      .catch((e) => {
        if (active)
          setResponse({
            key: requestKey,
            error:
              e.response?.status === 403
                ? "You do not have access to this league."
                : e.response?.status === 404
                  ? "Season not found."
                  : "Could not load season points. Please retry.",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestKey, leagueId, seasonId, auth.isAuthenticated, validSeason]);
  return (
    <>
      <NavBar
        isLoggedIn={auth.isAuthenticated}
        user={auth.user}
        currentUserPlayer={auth.currentUserPlayer}
        onSignOut={auth.logout}
        onSignIn={() => openAuthModal("sign-in")}
        onSignUp={() => openAuthModal("sign-up")}
      />
      <div className="season-explorer-toolbar">
        <Link href={`/league/${leagueId}?tab=rankings&season=${seasonId}`}>
          ← Back to season leaderboard
        </Link>
      </div>
      {auth.isInitializing ? (
        <p className="season-explorer-state" role="status">
          Loading account…
        </p>
      ) : !auth.isAuthenticated ? (
        <div className="season-explorer-state">
          <h1>Season points</h1>
          <button
            className="league-text-button"
            onClick={() => openAuthModal("sign-in")}
          >
            Sign in to explore this season
          </button>
        </div>
      ) : error ? (
        <div className="season-explorer-state" role="alert">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </div>
      ) : loading ? (
        <p className="season-explorer-state" role="status">
          Loading season points…
        </p>
      ) : data?.players.length ? (
        <SeasonExplorer key={key} season={data} />
      ) : (
        <p className="season-explorer-state">
          No official results for this season yet.
        </p>
      )}
    </>
  );
}
