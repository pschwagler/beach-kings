'use client';

import Link from 'next/link';
import NavBar from '../../../../src/components/layout/NavBar';
import { useAuth } from '../../../../src/contexts/AuthContext';
import '../../../../src/styles/legal-pages.css';

/** Registered return URL; popup authorization is completed by the initiating UI. */
export default function AppleCallbackPage() {
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();
  return <div className="legal-page-container">
    <NavBar isLoggedIn={isAuthenticated} user={user} currentUserPlayer={currentUserPlayer} onSignOut={logout} />
    <main className="legal-page-main">
      <h1>Apple sign-in</h1>
      <p>Return to the Beach League window where you started signing in. If it did not finish, close this window and try again.</p>
      <Link href="/">Return to Beach League</Link>
    </main>
  </div>;
}
