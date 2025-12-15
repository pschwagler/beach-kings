'use client';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import "../src/App.css";
import NavBar from "../src/components/layout/NavBar";
import CreateLeagueModal from "../src/components/league/CreateLeagueModal";
import PlayerProfileModal from "../src/components/player/PlayerProfileModal";
import { useAuth } from "../src/contexts/AuthContext";
import { useAuthModal } from "../src/contexts/AuthModalContext";
import { createLeague, getUserLeagues } from "../src/services/api";
import { isProfileIncomplete } from "../src/utils/playerUtils";

export default function Page() {
  const router = useRouter();
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
      router.push("/home");
    }
  }, [isAuthenticated, router]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      router.push("/");
    }
  };

  const handleVerifySuccess = useCallback(() => {
    setJustSignedUp(true);
  }, []);

  const navigateToLeague = useCallback((leagueId) => {
    router.push(`/league/${leagueId}`);
  }, [router]);

  // Check if user needs to complete profile after signup
  useEffect(() => {
    if (isAuthenticated && justSignedUp) {
      // Check if profile is incomplete (missing gender, level, or city)
      const profileIncomplete = isProfileIncomplete(currentUserPlayer);
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
  }, [isAuthenticated, pendingAction, navigateToLeague]);

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
    const handleShowLoginModal = () => {
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
    if (typeof window === 'undefined') return;
    
    let scrollTimeout;
    const handleScroll = () => {
      if (typeof document !== 'undefined') {
        document.body.classList.add("scrolling");
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          document.body.classList.remove("scrolling");
        }, 1000);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  const handleCreateLeague = async (leagueData) => {
    const newLeague = await createLeague(leagueData);
    const leagues = await getUserLeagues();
    setUserLeagues(leagues);
    router.push(`/league/${newLeague.id}?tab=details`);
    return newLeague;
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
              <Image
                src="/beach-league-gold-on-white-cropped.png"
                alt="Beach League"
                width={200}
                height={50}
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
        currentUserPlayer={currentUserPlayer}
        onSuccess={async () => {
          if (isAuthenticated) {
            await fetchCurrentUser();
          }
        }}
      />
    </>
  );
}
