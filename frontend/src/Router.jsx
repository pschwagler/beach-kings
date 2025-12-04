import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage.jsx';
import HomePage from './components/HomePage.jsx';
import WhatsAppPage from './components/WhatsAppPage.jsx';
import LeagueDashboard from './components/league/LeagueDashboard.jsx';
import { AuthModalProvider, useAuthModal } from './contexts/AuthModalContext.jsx';
import AuthModal from './components/auth/AuthModal.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import PrivacyPolicyPage from './components/PrivacyPolicyPage.jsx';
import TermsOfServicePage from './components/TermsOfServicePage.jsx';
import GlobalModal from './components/ui/GlobalModal.jsx';
import GlobalDrawer from './components/ui/GlobalDrawer.jsx';
import { ModalProvider } from './contexts/ModalContext.jsx';
import { DrawerProvider } from './contexts/DrawerContext.jsx';

import Footer from './components/Footer.jsx';

function RouterContent() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const { isAuthModalOpen, authModalMode, closeAuthModal, handleVerifySuccess, openAuthModal } = useAuthModal();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    // Handle browser back/forward buttons
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle /signup and /login routes
  useEffect(() => {
    if (currentPath === '/signup') {
      openAuthModal('sign-up');
      // Redirect to appropriate page based on auth status
      const targetPath = isAuthenticated ? '/home' : '/';
      window.history.replaceState({}, '', targetPath);
      setCurrentPath(targetPath);
    } else if (currentPath === '/login') {
      openAuthModal('sign-in');
      // Redirect to appropriate page based on auth status
      const targetPath = isAuthenticated ? '/home' : '/';
      window.history.replaceState({}, '', targetPath);
      setCurrentPath(targetPath);
    }
  }, [currentPath, isAuthenticated, openAuthModal]);

  // Handle redirects based on authentication
  useEffect(() => {
    if (currentPath === '/' && isAuthenticated) {
      // Redirect authenticated users from landing to dashboard
      navigateTo('/home');
    } else if (currentPath === '/home' && !isAuthenticated) {
      // Redirect unauthenticated users from dashboard to landing
      navigateTo('/');
    }
  }, [currentPath, isAuthenticated]);

  // Extract league ID from path if it matches /league/:id
  const leagueMatch = currentPath.match(/^\/league\/(\d+)$/);
  const leagueId = leagueMatch ? parseInt(leagueMatch[1]) : null;

  // Simple router based on pathname
  let pageContent;
  if (currentPath === '/whatsapp') {
    pageContent = <WhatsAppPage />;
  } else if (currentPath === '/privacy-policy') {
    pageContent = <PrivacyPolicyPage />;
  } else if (currentPath === '/terms-of-service') {
    pageContent = <TermsOfServicePage />;
  } else if (currentPath === '/profile') {
    // Redirect /profile to /home?tab=profile
    navigateTo('/home?tab=profile');
    pageContent = <HomePage />;
  } else if (currentPath === '/home') {
    pageContent = <HomePage />;
  } else if (leagueId) {
    pageContent = <LeagueDashboard leagueId={leagueId} />;
  } else {
    // Default to landing page
    pageContent = <LandingPage />;
  }

  return (
    <div className="app-container">
      <div className="main-content">
        {pageContent}
      </div>
      <Footer />
      <AuthModal
        isOpen={isAuthModalOpen}
        mode={authModalMode}
        onClose={closeAuthModal}
        onVerifySuccess={handleVerifySuccess}
      />
      <GlobalModal />
      <GlobalDrawer />
    </div>
  );
}



function Router() {
  return (
    <AuthModalProvider>
      <ModalProvider>
        <DrawerProvider>
          <RouterContent />
        </DrawerProvider>
      </ModalProvider>
    </AuthModalProvider>
  );
}

// Export navigation helper function
export const navigateTo = (path) => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export default Router;

