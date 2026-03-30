"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { useAuthModal } from "../contexts/AuthModalContext";
import { useModal, MODAL_TYPES } from "../contexts/ModalContext";
import { getUserLeagues, createLeague, addLeagueHomeCourt } from "../services/api";
import type { League } from "../types";
import { Loader2 } from "lucide-react";
import NavBar from "./layout/NavBar";
import HomeTab from "./home/HomeTab";
import ProfileTab from "./home/ProfileTab";
import LeaguesTab from "./home/LeaguesTab";
import MyGamesTab from "./home/MyGamesTab";
import FriendsTab from "./home/FriendsTab";
import PendingInvitesTab from "./home/PendingInvitesTab";
import NotificationsTab from "./home/NotificationsTab";
import MyStatsTab from "./home/MyStatsTab";
import MessagesTab from "./home/MessagesTab";
import HomeMenuBar from "./home/HomeMenuBar";
import { isProfileIncomplete } from "../utils/playerUtils";

interface HomePageProps {
  initialTab?: string;
}

export default function HomePage({ initialTab = 'home' }: HomePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, currentUserPlayer, isAuthenticated, isInitializing, sessionExpired, fetchCurrentUser, logout } =
    useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();

  // Use searchParams for client-side navigation, fall back to server-provided initialTab
  const activeTab = searchParams?.get("tab") || initialTab;
  const [userLeagues, setUserLeagues] = useState<League[]>([]);

  // Redirect if not authenticated (wait for auth to finish initializing).
  // Skip redirect when session expired — show the expired message instead.
  useEffect(() => {
    if (!isInitializing && !isAuthenticated && !sessionExpired) {
      router.push("/");
    }
  }, [isAuthenticated, isInitializing, sessionExpired, router]);

  // Check if profile is incomplete and open modal if needed
  // This runs every time the user visits the home page or when currentUserPlayer changes
  useEffect(() => {
    if (isAuthenticated) {
      // If currentUserPlayer hasn't loaded yet, fetch it first
      if (currentUserPlayer === undefined) {
        fetchCurrentUser();
        return; // Will re-run when currentUserPlayer updates
      }

      // Check if profile is incomplete (missing gender, level, or city)
      const profileIncomplete = isProfileIncomplete(currentUserPlayer);

      if (profileIncomplete) {
        // Small delay to ensure page is rendered and avoid conflicts with other modals
        const timeoutId = setTimeout(() => {
          openModal(MODAL_TYPES.PLAYER_PROFILE, {
            currentUserPlayer: currentUserPlayer,
            onSuccess: async () => {
              await fetchCurrentUser();
            },
          });
        }, 500);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [isAuthenticated, currentUserPlayer, openModal, fetchCurrentUser]);

  // Navigation blocking is now handled by ProfileTab using useBlocker hook

  // Load user leagues
  useEffect(() => {
    const loadUserLeagues = async () => {
      if (isAuthenticated) {
        try {
          const leagues = await getUserLeagues();
          setUserLeagues(leagues);
        } catch (err) {
          console.error("Error loading user leagues:", err);
        }
      }
    };
    loadUserLeagues();
  }, [isAuthenticated]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      router.push("/");
    }
  };

  const handleTabChange = (tab: string) => {
    // Update URL with new tab using Next.js router
    const newSearchParams = new URLSearchParams(searchParams?.toString() || "");
    newSearchParams.set("tab", tab);
    router.push(`/home?${newSearchParams.toString()}`);

    // Scroll to top of the page
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleCreateLeague = async (leagueData: Record<string, unknown>) => {
    const { initial_court_id, ...payload } = leagueData;
    const newLeague = await createLeague(payload);
    if (initial_court_id && newLeague?.id) {
      try { await addLeagueHomeCourt(newLeague.id, initial_court_id as number); } catch {}
    }
    const leagues = await getUserLeagues();
    setUserLeagues(leagues);
    router.push(`/league/${newLeague.id}?tab=details`);
    return newLeague;
  };

  const handleLeaguesMenuClick = (action: string, leagueId: number | null = null) => {
    if (action === "create-league") {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: handleCreateLeague,
      });
    } else if (action === "view-league" && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === "find-leagues") {
      router.push("/find-leagues");
    }
  };

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: 'var(--primary)' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (sessionExpired) {
      return (
        <>
          <NavBar
            isLoggedIn={false}
            onSignIn={() => openAuthModal("sign-in")}
            onSignUp={() => openAuthModal("sign-up")}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px', padding: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '16px', color: 'var(--gray-700)' }}>Your session has expired. Please sign in again.</p>
            <button
              className="btn btn-primary"
              onClick={() => openAuthModal("sign-in")}
              style={{ padding: '10px 24px', fontSize: '15px' }}
            >
              Sign In
            </button>
          </div>
        </>
      );
    }
    return null;
  }

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal("sign-in")}
        onSignUp={() => openAuthModal("sign-up")}
      />
      <div className="league-dashboard-container">
        <div className="league-dashboard">
          <HomeMenuBar activeTab={activeTab} />

          {/* Main Content Area */}
          <main className="home-content">
            <div className="profile-page-content">
              {activeTab === "home" && (
                <HomeTab
                  currentUserPlayer={currentUserPlayer}
                  userLeagues={userLeagues}
                  onTabChange={handleTabChange}
                  onLeaguesUpdate={async () => {
                    const leagues = await getUserLeagues();
                    setUserLeagues(leagues);
                  }}
                />
              )}

              {activeTab === "profile" && (
                <ProfileTab
                  user={user}
                  currentUserPlayer={currentUserPlayer}
                  fetchCurrentUser={fetchCurrentUser}
                />
              )}

              {activeTab === "leagues" && (
                <LeaguesTab
                  userLeagues={userLeagues}
                  onLeagueClick={handleLeaguesMenuClick}
                  onLeaguesUpdate={async () => {
                    const leagues = await getUserLeagues();
                    setUserLeagues(leagues);
                  }}
                />
              )}

              {activeTab === "my-games" && (
                <MyGamesTab
                  currentUserPlayer={currentUserPlayer}
                  onTabChange={handleTabChange}
                  onMatchClick={(match) => {
                    const sessionCode = match?.["Session Code"];
                    if (sessionCode) {
                      router.push(`/session/${sessionCode}`);
                      return;
                    }
                    const leagueId = match?.["League ID"];
                    if (leagueId) {
                      const params = new URLSearchParams();
                      params.set("tab", "matches");
                      if (match["Season ID"]) params.set("season", String(match["Season ID"]));
                      router.push(`/league/${leagueId}?${params.toString()}`);
                    }
                  }}
                />
              )}

              {activeTab === "my-stats" && (
                <MyStatsTab
                  currentUserPlayer={currentUserPlayer}
                />
              )}

              {activeTab === "messages" && <MessagesTab />}

              {activeTab === "friends" && <FriendsTab />}

              {activeTab === "invites" && <PendingInvitesTab />}

              {activeTab === "notifications" && <NotificationsTab />}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
