import { useState, useEffect, useCallback } from "react";
import "../App.css";
import NavBar from "./layout/NavBar";
import CreateLeagueModal from "./league/CreateLeagueModal";
import PlayerProfileModal from "./player/PlayerProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useAuthModal } from "../contexts/AuthModalContext";
import { createLeague, getUserLeagues } from "../services/api";
import { navigateTo } from "../Router";

export default function LandingPage() {
  const { isAuthenticated, user, logout, currentUserPlayer, fetchCurrentUser } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isCreateLeagueModalOpen, setIsCreateLeagueModalOpen] = useState(false);
  const [isPlayerProfileModalOpen, setIsPlayerProfileModalOpen] = useState(false);
  const [userLeagues, setUserLeagues] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [justSignedUp, setJustSignedUp] = useState(false);

  // Redirect authenticated users to /home
  useEffect(() => {
    if (isAuthenticated) {
      navigateTo("/home");
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
        <div className="landing-content">
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
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
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

