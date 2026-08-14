'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../src/components/layout/NavBar';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAuthModal } from '../../src/contexts/AuthModalContext';

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
    } else {
      router.replace('/home?tab=profile');
    }
  }, [isAuthenticated, router]);

  // Render the Navbar while the redirect resolves so the page never appears
  // without it (required on every page, including unauthenticated ones).
  return (
    <NavBar
      isLoggedIn={false}
      onSignIn={() => openAuthModal('sign-in')}
      onSignUp={() => openAuthModal('sign-up')}
    />
  );
}
