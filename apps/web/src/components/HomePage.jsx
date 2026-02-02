"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { useAuthModal } from "../contexts/AuthModalContext";
import { useModal, MODAL_TYPES } from "../contexts/ModalContext";
import { getUserLeagues, createLeague } from "../services/api";
import NavBar from "./layout/NavBar";
import HomeTab from "./home/HomeTab";
import ProfileTab from "./home/ProfileTab";
import LeaguesTab from "./home/LeaguesTab";
import MyGamesTab from "./home/MyGamesTab";
import FriendsTab from "./home/FriendsTab";
import NotificationsTab from "./home/NotificationsTab";
import HomeMenuBar from "./home/HomeMenuBar";
import { isProfileIncomplete } from "../utils/playerUtils";

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, currentUserPlayer, isAuthenticated, fetchCurrentUser, logout } =
    useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();

  // Get active tab from URL query params
  const activeTab = searchParams?.get("tab") || "home";
  const [userLeagues, setUserLeagues] = useState([]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

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

  const handleTabChange = (tab) => {
    // Update URL with new tab using Next.js router
    const newSearchParams = new URLSearchParams(searchParams?.toString() || "");
    newSearchParams.set("tab", tab);
    router.push(`/home?${newSearchParams.toString()}`);

    // Scroll to top of the page
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleCreateLeague = async (leagueData) => {
    const newLeague = await createLeague(leagueData);
    const leagues = await getUserLeagues();
    setUserLeagues(leagues);
    router.push(`/league/${newLeague.id}?tab=details`);
    return newLeague;
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
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

  if (!isAuthenticated) {
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

              {activeTab === "friends" && <FriendsTab />}

              {activeTab === "notifications" && <NotificationsTab />}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
