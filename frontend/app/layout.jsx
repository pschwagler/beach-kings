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
import '../src/index.css';
import '../src/App.css';

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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=1.0, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <title>Beach League Volleyball</title>
      </head>
      <body>
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
      </body>
    </html>
  );
}

