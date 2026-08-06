'use client';

import NavBar from '../../src/components/layout/NavBar';
import { useAuth } from '../../src/contexts/AuthContext';
import '../../src/styles/legal-pages.css';

export default function CommunityGuidelinesPage() {
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
          <h1 className="legal-page-title">Community Guidelines</h1>
          <p className="legal-page-date"><strong>Effective:</strong> August 5, 2026</p>
        </div>
        <section className="legal-section">
          <p className="legal-intro">
            Beach League is for organizing play, sharing useful court information, and connecting with the volleyball community. Treat other players with respect on and off the court.
          </p>

          <h3>Keep Beach League safe</h3>
          <p>Do not post, send, or upload content that includes:</p>
          <ul>
            <li>Harassment, bullying, targeted insults, or unwanted repeated contact.</li>
            <li>Hate or discrimination based on a protected characteristic.</li>
            <li>Threats, encouragement of violence, or instructions for self-harm.</li>
            <li>Sexual content, sexual solicitation, or any conduct that puts a minor at risk.</li>
            <li>Another person&apos;s private information, impersonation, or deceptive identity claims.</li>
            <li>Spam, scams, malicious links, or coordinated manipulation.</li>
            <li>Illegal content or content that meaningfully endangers another person.</li>
          </ul>

          <h3>Report and block</h3>
          <p>
            Use the Report action on a player, message, review, or photo to send it for review. Reports are confidential and the reported person is not told who submitted them. Blocking stops direct friend, invitation, notification, and messaging interactions in both directions. Shared league schedules, rosters, standings, scores, history, and league chat remain available; messages between blocked players are collapsed until revealed.
          </p>

          <h3>What may happen</h3>
          <p>
            We may limit interactions, warn an account, or quarantine or remove content that violates these guidelines. Automated systems may assist with detection and prioritization, but account and content actions are reviewable by the moderation owner. We do not promise a particular outcome or response time for an ordinary report.
          </p>

          <h3>Questions and manual review</h3>
          <p>
            If you believe a safety action was made in error, contact <a href="/support">Support</a> for manual review. If someone is in immediate danger, contact local emergency services. Do not use in-app reporting as a substitute for emergency help.
          </p>
        </section>
      </main>
    </div>
  );
}
