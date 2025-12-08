import { useState, useEffect, useCallback } from "react";
import "./App.css";
import NavBar from "./components/layout/NavBar";
import MyLeaguesWidget from "./components/dashboard/MyLeaguesWidget";
import MyMatchesWidget from "./components/dashboard/MyMatchesWidget";
import { useAuth } from "./contexts/AuthContext";
import { useAuthModal } from "./contexts/AuthModalContext";
import { createLeague, getUserLeagues, getPlayerMatchHistory } from "./services/api";
import { navigateTo } from "./Router";
import { useModal, MODAL_TYPES } from "./contexts/ModalContext";
import { isProfileIncomplete } from "./utils/playerUtils";

function App() {
  const { isAuthenticated, user, logout, currentUserPlayer, fetchCurrentUser } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const [userLeagues, setUserLeagues] = useState([]);
  const [userMatches, setUserMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [justSignedUp, setJustSignedUp] = useState(false);

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

  // Open profile modal after signup when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && justSignedUp) {
      // Wait a bit for user data to load, then check if profile needs completion
      const openProfileModal = async () => {
        // Fetch user data to get current player profile
        await fetchCurrentUser();
        
        // Wait a moment for state to update, then check profile
        setTimeout(() => {
          // Check if profile is incomplete (missing gender, level, or city)
          const profileIncomplete = isProfileIncomplete(currentUserPlayer);
          
          // Always open modal for new signups (profile will be incomplete)
          if (profileIncomplete) {
            openModal(MODAL_TYPES.PLAYER_PROFILE, {
              currentUserPlayer: currentUserPlayer,
              onSuccess: async () => {
                if (isAuthenticated) {
                  await fetchCurrentUser();
                }
              }
            });
          }
          setJustSignedUp(false);
        }, 1000);
      };
      
      openProfileModal();
    }
  }, [isAuthenticated, justSignedUp, currentUserPlayer, fetchCurrentUser, openModal]);

  // Execute pending action after successful authentication
  useEffect(() => {
    if (isAuthenticated && pendingAction) {
      const timeoutId = setTimeout(() => {
        if (pendingAction.type === "create-league") {
          openModal(MODAL_TYPES.CREATE_LEAGUE, {
            onSubmit: handleCreateLeague
          });
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

  // Load leagues when user authenticates
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
    } else {
      setUserLeagues([]);
    }
  }, [isAuthenticated]);

  // Load user matches when authenticated
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
    } else {
      setUserMatches([]);
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
      }, 1000); // Hide scrollbar 1 second after scrolling stops
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Also handle scroll on document and html element for better compatibility
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
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: handleCreateLeague
      });
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
        {!isAuthenticated && (
          <div className="homepage-video-container">
            <video
              ref={(el) => {
                if (el && !el.dataset.initialized) {
                  el.dataset.initialized = "true";
                  setTimeout(() => el.play(), 1000);
                }
              }}
              muted
              playsInline
              controls
              className="homepage-video"
            >
              <source
                src="/Beach_Volleyball_Champion_Crown_Moment.mp4"
                type="video/mp4"
              />
            </video>
          </div>
        )}
        <div className="landing-content">
          {!isAuthenticated ? (
            <div className="landing-message">
              <h2 className="landing-welcome-title">
                Welcome to{" "}
                <img
                  src="/beach-league-gold-on-white-cropped.png"
                  alt="Beach League"
                  className="landing-brand-logo"
                />
              </h2>
              <p>Log in to get started</p>
              <div className="flex-center-gap">
                <button
                  className="btn btn-primary"
                  onClick={() => openAuthModal("sign-in", handleVerifySuccess)}
                >
                  Log In
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => openAuthModal("sign-up", handleVerifySuccess)}
                >
                  Sign Up
                </button>
              </div>
            </div>
          ) : (
            <div className="dashboard-container">
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
          )}
        </div>
      </div>
    </>
  );
}

export default App;
