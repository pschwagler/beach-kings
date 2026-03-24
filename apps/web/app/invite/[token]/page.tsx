'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../src/contexts/AuthModalContext';
import { getInviteDetails, claimInvite, getUserLeagues } from '../../../src/services/api';
import NavBar from '../../../src/components/layout/NavBar';
import { Button } from '../../../src/components/ui/UI';

/**
 * Invite landing page for placeholder player claim flow.
 *
 * Reachable at /invite/[token]. Public (works unauthenticated).
 * Shows invite context (inviter name, match count, leagues), then:
 *   - Unauthenticated: Sign Up / Log In CTAs (opens global AuthModal)
 *   - Authenticated: "Claim My Matches" confirmation
 *   - Already claimed: info message
 */
export default function InviteLandingPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token;
  const { isAuthenticated, isInitializing, user, currentUserPlayer, logout } = useAuth();
  const { openAuthModal } = useAuthModal();

  // --- NavBar state ---
  const [userLeagues, setUserLeagues] = useState([]);

  // --- Page state ---
  const [pageState, setPageState] = useState('loading'); // loading | loaded | error
  const [invite, setInvite] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // --- Claim state ---
  const [claimState, setClaimState] = useState('idle'); // idle | claiming | success | error
  const [claimResult, setClaimResult] = useState(null);
  const [claimError, setClaimError] = useState('');

  // Fetch invite details
  const fetchInvite = useCallback(async () => {
    if (!token) {
      setPageState('error');
      setErrorMessage('No invite token provided.');
      return;
    }
    try {
      setPageState('loading');
      const data = await getInviteDetails(token);
      setInvite(data);
      setPageState('loaded');
    } catch (err) {
      setPageState('error');
      const status = err.response?.status;
      if (status === 404) {
        setErrorMessage('This invite link is invalid or has expired.');
      } else {
        setErrorMessage('Something went wrong loading this invite. Please try again.');
      }
    }
  }, [token]);

  useEffect(() => {
    fetchInvite();
  }, [fetchInvite]);

  // Load user leagues for NavBar when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUserLeagues([]);
      return;
    }
    getUserLeagues()
      .then(setUserLeagues)
      .catch(() => setUserLeagues([]));
  }, [isAuthenticated]);

  // --- Auth handlers ---
  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  /**
   * No-op verify-success callback suppresses the profile-completion modal.
   * After auth, the user stays on this page and the reactive auth state
   * change shows the claim UI automatically.
   */
  const noOpVerifySuccess = useCallback(() => {}, []);

  const handleSignUp = () => openAuthModal('sign-up', noOpVerifySuccess);
  const handleSignIn = () => openAuthModal('sign-in', noOpVerifySuccess);

  // --- Claim handler ---
  const handleClaim = async () => {
    try {
      setClaimState('claiming');
      setClaimError('');
      const result = await claimInvite(token);
      setClaimResult(result);
      setClaimState('success');
    } catch (err) {
      setClaimState('error');
      const detail = err.response?.data?.detail;
      setClaimError(detail || 'Failed to claim matches. Please try again.');
    }
  };

  // --- Render helpers ---

  /** Loading skeleton */
  const renderLoading = () => (
    <div className="invite-page__card">
      <div className="invite-page__skeleton">
        <div className="invite-page__skeleton-line invite-page__skeleton-line--wide" />
        <div className="invite-page__skeleton-line invite-page__skeleton-line--narrow" />
        <div className="invite-page__skeleton-line invite-page__skeleton-line--medium" />
      </div>
    </div>
  );

  /** Error state (bad/missing token) */
  const renderError = () => (
    <div className="invite-page__card">
      <div className="invite-page__icon-wrapper invite-page__icon-wrapper--error">
        <AlertCircle size={40} />
      </div>
      <h1 className="invite-page__heading">Invalid Invite</h1>
      <p className="invite-page__description">{errorMessage}</p>
      <Button variant="outline" onClick={() => router.push('/')} className="invite-page__cta">
        Go to Home
      </Button>
    </div>
  );

  /** Already-claimed state */
  const renderAlreadyClaimed = () => (
    <div className="invite-page__card">
      <div className="invite-page__icon-wrapper invite-page__icon-wrapper--info">
        <CheckCircle size={40} />
      </div>
      <h1 className="invite-page__heading">Already Claimed</h1>
      <p className="invite-page__description">
        These matches have already been claimed.
      </p>
      <Button variant="outline" onClick={() => router.push('/')} className="invite-page__cta">
        Go to Home
      </Button>
    </div>
  );

  /** Invite context block (shared between unauthed + authed-idle views) */
  const renderInviteContext = () => (
    <>
      <div className="invite-page__logo">
        <Image
          src="/beach-league-gold-on-white-cropped.png"
          alt="Beach League"
          width={180}
          height={45}
          priority
        />
      </div>
      <h1 className="invite-page__heading">You&rsquo;ve Been Invited!</h1>
      <p className="invite-page__description">
        <strong>{invite.inviter_name}</strong> recorded{' '}
        {invite.match_count === 1 ? 'a match' : 'matches'} with you on Beach League.
      </p>
      <div className="invite-page__match-count">
        <span className="invite-page__match-count-number">{invite.match_count}</span>
        <span className="invite-page__match-count-label">
          {invite.match_count === 1 ? 'match' : 'matches'} waiting for you
        </span>
      </div>
      {invite.league_names?.length > 0 && (
        <div className="invite-page__leagues">
          {invite.league_names.map((name) => (
            <span key={name} className="invite-page__league-badge">{name}</span>
          ))}
        </div>
      )}
    </>
  );

  /** Unauthenticated: show context + sign-up / log-in CTAs */
  const renderUnauthenticated = () => (
    <div className="invite-page__card">
      {renderInviteContext()}
      <p className="invite-page__cta-hint">
        Sign up or log in to claim your matches.
      </p>
      <div className="invite-page__cta-group">
        <Button onClick={handleSignUp} className="invite-page__cta">
          Sign Up
        </Button>
        <Button variant="outline" onClick={handleSignIn} className="invite-page__cta">
          Log In
        </Button>
      </div>
    </div>
  );

  /** Authenticated, idle: show context + claim button */
  const renderClaimReady = () => (
    <div className="invite-page__card">
      {renderInviteContext()}
      <div className="invite-page__cta-group">
        <Button onClick={handleClaim} className="invite-page__cta">
          Claim My Matches
        </Button>
        <Button variant="ghost" onClick={() => router.push('/home')} className="invite-page__cta">
          Cancel
        </Button>
      </div>
    </div>
  );

  /** Claiming in progress */
  const renderClaiming = () => (
    <div className="invite-page__card">
      {renderInviteContext()}
      <div className="invite-page__cta-group">
        <Button disabled className="invite-page__cta">
          <span className="invite-page__spinner" /> Claiming...
        </Button>
      </div>
    </div>
  );

  /** Claim success */
  const renderSuccess = () => (
    <div className="invite-page__card">
      <div className="invite-page__success">
        <CheckCircle size={48} />
      </div>
      <h1 className="invite-page__heading">Matches Claimed!</h1>
      <p className="invite-page__description">
        {claimResult?.message || 'Your matches have been linked to your account.'}
      </p>
      {claimResult?.warnings?.length > 0 && (
        <div className="invite-page__warnings">
          <div className="invite-page__warnings-header">
            <AlertTriangle size={16} />
            <span>Some matches had issues:</span>
          </div>
          <ul className="invite-page__warnings-list">
            {claimResult.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <Button onClick={() => router.push('/home')} className="invite-page__cta">
        Go to Home
      </Button>
    </div>
  );

  /** Claim error */
  const renderClaimError = () => (
    <div className="invite-page__card">
      <div className="invite-page__icon-wrapper invite-page__icon-wrapper--error">
        <AlertCircle size={40} />
      </div>
      <h1 className="invite-page__heading">Claim Failed</h1>
      <p className="invite-page__description">{claimError}</p>
      <div className="invite-page__cta-group">
        <Button onClick={handleClaim} className="invite-page__cta">
          Try Again
        </Button>
        <Button variant="ghost" onClick={() => router.push('/home')} className="invite-page__cta">
          Go to Home
        </Button>
      </div>
    </div>
  );

  // --- Determine which body to render ---
  const renderBody = () => {
    // Still initializing auth or loading invite
    if (isInitializing || pageState === 'loading') return renderLoading();
    // Invite fetch failed
    if (pageState === 'error') return renderError();
    // Invite was already claimed
    if (invite?.status === 'claimed') return renderAlreadyClaimed();
    // Claim states
    if (claimState === 'success') return renderSuccess();
    if (claimState === 'error') return renderClaimError();
    if (claimState === 'claiming') return renderClaiming();
    // Not authenticated — show sign-up/log-in CTAs
    if (!isAuthenticated) return renderUnauthenticated();
    // Authenticated, ready to claim
    return renderClaimReady();
  };

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        onSignOut={handleSignOut}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        userLeagues={userLeagues}
      />
      <div className="invite-page">
        {renderBody()}
      </div>
    </>
  );
}
