'use client';

import NavBar from '../src/components/layout/NavBar';
import { useAuth } from '../src/contexts/AuthContext';

/**
 * Custom 404 page — renders with NavBar per project rule
 * that every page must include the Navbar.
 */
export default function NotFound() {
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        onSignOut={logout}
      />
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '40px 20px',
        textAlign: 'center',
        marginTop: 'var(--navbar-height)',
      }}>
        <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '12px' }}>
          Page not found
        </h2>
        <p style={{ fontSize: '15px', color: '#757575', marginBottom: '24px', maxWidth: '400px' }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <a
          href="/home"
          style={{
            padding: '10px 24px',
            fontSize: '15px',
            fontWeight: 500,
            color: '#fff',
            backgroundColor: '#2c7a8f',
            border: 'none',
            borderRadius: '8px',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          Go home
        </a>
      </div>
    </>
  );
}
