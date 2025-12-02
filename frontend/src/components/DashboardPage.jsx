import { useState, useEffect, useCallback } from "react";
import "../App.css";
import NavBar from "./layout/NavBar";
import CreateLeagueModal from "./league/CreateLeagueModal";
import PlayerProfileModal from "./player/PlayerProfileModal";
import MyLeaguesWidget from "./dashboard/MyLeaguesWidget";
import MyMatchesWidget from "./dashboard/MyMatchesWidget";
import { useAuth } from "../contexts/AuthContext";
import { useAuthModal } from "../contexts/AuthModalContext";
import { createLeague, getUserLeagues, getPlayerMatchHistory } from "../services/api";
import { navigateTo } from "../Router";

export default function DashboardPage() {
  const { isAuthenticated, user, logout, currentUserPlayer, fetchCurrentUser } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isCreateLeagueModalOpen, setIsCreateLeagueModalOpen] = useState(false);
  const [isPlayerProfileModalOpen, setIsPlayerProfileModalOpen] = useState(false);
  const [userLeagues, setUserLeagues] = useState([]);
  const [userMatches, setUserMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [justSignedUp, setJustSignedUp] = useState(false);

  // Redirect unauthenticated users to landing page
  useEffect(() => {
    if (!isAuthenticated) {
      navigateTo("/");
    }
  }, [isAuthenticated]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      navigateTo("/");
    }
  };

  const handleVerifySuccess = useCallback(() => {
    setJustSignedUp(true);
  }, []);

  // Check if user needs to complete profile after signup
  useEffect(() => {
    if (isAuthenticated && justSignedUp) {
      // Check if profile is incomplete (missing gender or level)
      const profileIncomplete = !currentUserPlayer?.gender || !currentUserPlayer?.level;
      if (profileIncomplete) {
        setTimeout(() => {
          setIsPlayerProfileModalOpen(true);
        }, 200);
      }
      setJustSignedUp(false);
    }
  }, [isAuthenticated, justSignedUp, currentUserPlayer]);

  // Execute pending action after successful authentication
  useEffect(() => {
    if (isAuthenticated && pendingAction) {
      const timeoutId = setTimeout(() => {
        if (pendingAction.type === "create-league") {
          setIsCreateLeagueModalOpen(true);
        } else if (
          pendingAction.type === "view-league" &&
          pendingAction.leagueId
        ) {
          navigateToLeague(pendingAction.leagueId);
        }
        setPendingAction(null);
      }, 200);

      return () => clearTimeout(timeoutId);
    }
  }, [isAuthenticated, pendingAction]);

  // Load leagues when component mounts
  useEffect(() => {
    const loadUserLeagues = async () => {
      try {
        const leagues = await getUserLeagues();
        setUserLeagues(leagues);
      } catch (error) {
        console.error("Error loading user leagues:", error);
        setUserLeagues([]);
      }
    };

    if (isAuthenticated) {
      loadUserLeagues();
    }
  }, [isAuthenticated]);

  // Load user matches when component mounts
  useEffect(() => {
    const loadUserMatches = async () => {
      if (!isAuthenticated || !currentUserPlayer) return;
      
      setLoadingMatches(true);
      try {
        const playerName = currentUserPlayer.full_name || currentUserPlayer.nickname;
        if (!playerName) {
          setUserMatches([]);
          return;
        }

        // Get match history for this player
        const matches = await getPlayerMatchHistory(playerName);
        // Sort by date descending and limit to 10
        const sortedMatches = (matches || [])
          .sort((a, b) => {
            const dateA = a.Date ? new Date(a.Date).getTime() : 0;
            const dateB = b.Date ? new Date(b.Date).getTime() : 0;
            return dateB - dateA;
          })
          .slice(0, 10);
        setUserMatches(sortedMatches);
      } catch (error) {
        console.error("Error loading user matches:", error);
        setUserMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    };

    if (isAuthenticated && currentUserPlayer) {
      loadUserMatches();
    }
  }, [isAuthenticated, currentUserPlayer]);

  // Listen for 403 forbidden errors to show login modal
  useEffect(() => {
    const handleShowLoginModal = (event) => {
      if (!isAuthenticated) {
        openAuthModal("sign-in");
      }
    };

    window.addEventListener("show-login-modal", handleShowLoginModal);

    return () => {
      window.removeEventListener("show-login-modal", handleShowLoginModal);
    };
  }, [isAuthenticated, openAuthModal]);

  // Auto-hide scrollbar when scrolling stops
  useEffect(() => {
    let scrollTimeout;
    const handleScroll = () => {
      document.body.classList.add("scrolling");
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        document.body.classList.remove("scrolling");
      }, 1000);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  const navigateToLeague = (leagueId) => {
    window.history.pushState({}, "", `/league/${leagueId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleCreateLeague = async (leagueData) => {
    try {
      const newLeague = await createLeague(leagueData);
      const leagues = await getUserLeagues();
      setUserLeagues(leagues);
      window.history.pushState({}, "", `/league/${newLeague.id}?tab=details`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return newLeague;
    } catch (error) {
      throw error;
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === "create-league") {
      if (!isAuthenticated) {
        setPendingAction({ type: "create-league" });
        openAuthModal("sign-in", handleVerifySuccess);
        return;
      }
      setIsCreateLeagueModalOpen(true);
    } else if (action === "view-league" && leagueId) {
      if (!isAuthenticated) {
        setPendingAction({ type: "view-league", leagueId });
        openAuthModal("sign-in", handleVerifySuccess);
        return;
      }
      navigateToLeague(leagueId);
    } else if (leagueId) {
      if (!isAuthenticated) {
        setPendingAction({ type: "view-league", leagueId });
        openAuthModal("sign-in", handleVerifySuccess);
        return;
      }
      navigateToLeague(leagueId);
    }
  };

  // Don't render content if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal("sign-in", handleVerifySuccess)}
        onSignUp={() => openAuthModal("sign-up", handleVerifySuccess)}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
      />
      <div className="container">
        <div className="landing-content">
          <div className="dashboard-container">
            <div className="dashboard-welcome">
              <h2 className="dashboard-welcome-title">
                Welcome back
                {currentUserPlayer?.first_name
                  ? ", " + currentUserPlayer.first_name
                  : ""}
                !
              </h2>
            </div>
            <div className="dashboard-widgets">
              <MyLeaguesWidget 
                leagues={userLeagues}
                onLeagueClick={navigateToLeague}
              />
              <MyMatchesWidget 
                matches={userMatches}
                currentUserPlayer={currentUserPlayer}
              />
            </div>
          </div>
        </div>
      </div>
      <CreateLeagueModal
        isOpen={isCreateLeagueModalOpen}
        onClose={() => setIsCreateLeagueModalOpen(false)}
        onSubmit={handleCreateLeague}
      />
      <PlayerProfileModal
        isOpen={isPlayerProfileModalOpen}
        onClose={() => setIsPlayerProfileModalOpen(false)}
        onSuccess={async () => {
          if (isAuthenticated) {
            await fetchCurrentUser();
          }
        }}
      />
    </>
  );
}

