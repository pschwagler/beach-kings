'use client';

import React from 'react';
import NavBar from '../../src/components/layout/NavBar';
import { useAuth } from '../../src/contexts/AuthContext';
import '../../src/styles/legal-pages.css';

export default function SupportPageRoute() {
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();

  return (
    <div className="legal-page-container">
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        onSignOut={logout}
      />

      <main className="legal-page-main">
        <div className="legal-page-header">
          <h1 className="legal-page-title">Beach League Support</h1>
        </div>

        <section className="legal-section">
          <p className="legal-intro">
            Need help with your Beach League account, leagues, games, or the mobile app?
          </p>
          <h3>Contact us</h3>
          <p>
            Email{' '}
            <a href="mailto:beachleaguevb+support@gmail.com?subject=Beach%20League%20Support">
              beachleaguevb+support@gmail.com
            </a>
            . Include the email address on your account and a short description of the issue.
            Never send your password or verification code.
          </p>
        </section>
      </main>
    </div>
  );
}
