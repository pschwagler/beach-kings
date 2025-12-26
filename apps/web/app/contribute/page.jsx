'use client';

import React from 'react';
import NavBar from '../../src/components/layout/NavBar';
import { useAuth } from '../../src/contexts/AuthContext';

export default function ContributePage() {
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();

  const repoUrl = 'https://github.com/patrick/beach-kings';

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
          <h1 className="legal-page-title">
            Contribute
          </h1>
        </div>
        <section className="legal-section">
          <p className="legal-intro">
            Beach League is an open source project built for the beach volleyball community.
          </p>
          <p>
            The codebase is open source, and contributions of all kinds are welcome&mdash;
            from suggestions, bug fixes, and new features to documentation improvements and designs.
          </p>
          <p>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              {repoUrl}
            </a>
          </p>
          <p>Thank You!</p>
        </section>
      </main>
    </div>
  );
}



