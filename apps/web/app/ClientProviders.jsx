'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { AppProvider } from '../src/contexts/AppContext';
import { AuthModalProvider, useAuthModal } from '../src/contexts/AuthModalContext';
import { ModalProvider } from '../src/contexts/ModalContext';
import { DrawerProvider } from '../src/contexts/DrawerContext';
import AuthModal from '../src/components/auth/AuthModal';
import GlobalModal from '../src/components/ui/GlobalModal';
import GlobalDrawer from '../src/components/ui/GlobalDrawer';
import Footer from '../src/components/Footer';

// Layout component that handles /signup and /login routes
function LayoutContent({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthModalOpen, authModalMode, closeAuthModal, handleVerifySuccess, openAuthModal } = useAuthModal();
  const { isAuthenticated } = useAuth();

  // Handle /signup and /login routes
  useEffect(() => {
    if (pathname === '/signup') {
      openAuthModal('sign-up');
      // Redirect to appropriate page based on auth status
      const targetPath = isAuthenticated ? '/home' : '/';
      router.replace(targetPath);
    } else if (pathname === '/login') {
      openAuthModal('sign-in');
      // Redirect to appropriate page based on auth status
      const targetPath = isAuthenticated ? '/home' : '/';
      router.replace(targetPath);
    }
  }, [pathname, isAuthenticated, openAuthModal, router]);

  return (
    <div className="app-container">
      <div className="main-content">
        {children}
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

export default function ClientProviders({ children }) {
  return (
    <AuthProvider>
      <AppProvider>
        <AuthModalProvider>
          <ModalProvider>
            <DrawerProvider>
              <LayoutContent>
                {children}
              </LayoutContent>
            </DrawerProvider>
          </ModalProvider>
        </AuthModalProvider>
      </AppProvider>
    </AuthProvider>
  );
}

