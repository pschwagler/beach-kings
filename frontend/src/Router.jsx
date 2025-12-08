import { createBrowserRouter, RouterProvider, Outlet, useLocation, useNavigate } from 'react-router-dom';
import LandingPage from './components/LandingPage.jsx';
import HomePage from './components/HomePage.jsx';
import WhatsAppPage from './components/WhatsAppPage.jsx';
import LeagueDashboard from './components/league/LeagueDashboard.jsx';
import AdminView from './components/AdminView.jsx';
import { AuthModalProvider, useAuthModal } from './contexts/AuthModalContext.jsx';
import AuthModal from './components/auth/AuthModal.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import PrivacyPolicyPage from './components/PrivacyPolicyPage.jsx';
import TermsOfServicePage from './components/TermsOfServicePage.jsx';
import GlobalModal from './components/ui/GlobalModal.jsx';
import GlobalDrawer from './components/ui/GlobalDrawer.jsx';
import { ModalProvider } from './contexts/ModalContext.jsx';
import { DrawerProvider } from './contexts/DrawerContext.jsx';
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import Footer from './components/Footer.jsx';

// Layout component that wraps all routes with context providers
function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthModalOpen, authModalMode, closeAuthModal, handleVerifySuccess, openAuthModal } = useAuthModal();
  const { isAuthenticated } = useAuth();

  // Handle /signup and /login routes
  useEffect(() => {
    if (location.pathname === '/signup') {
      openAuthModal('sign-up');
      // Redirect to appropriate page based on auth status
      const targetPath = isAuthenticated ? '/home' : '/';
      navigate(targetPath, { replace: true });
    } else if (location.pathname === '/login') {
      openAuthModal('sign-in');
      // Redirect to appropriate page based on auth status
      const targetPath = isAuthenticated ? '/home' : '/';
      navigate(targetPath, { replace: true });
    }
  }, [location.pathname, isAuthenticated, openAuthModal, navigate]);

  return (
    <div className="app-container">
      <div className="main-content">
        <Outlet />
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

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

// Public route wrapper that redirects authenticated users
function PublicRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/home" replace /> : children;
}

// Profile route that redirects to home with tab
function ProfileRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <Navigate to="/home?tab=profile" replace />;
}

// Create the router with future flags to suppress warnings
const router = createBrowserRouter(
  [
    {
      element: (
        <AuthModalProvider>
          <ModalProvider>
            <DrawerProvider>
              <Layout />
            </DrawerProvider>
          </ModalProvider>
        </AuthModalProvider>
      ),
      children: [
        {
          path: '/privacy-policy',
          element: <PrivacyPolicyPage />,
        },
        {
          path: '/terms-of-service',
          element: <TermsOfServicePage />,
        },
        {
          path: '/home',
          element: (
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          ),
        },
        {
          path: '/profile',
          element: <ProfileRoute />,
        },
        {
          path: '/league/:id',
          element: (
            <ProtectedRoute>
              <LeagueDashboard />
            </ProtectedRoute>
          ),
        },
        {
          path: '/whatsapp',
          element: (
            <ProtectedRoute>
              <WhatsAppPage />
            </ProtectedRoute>
          ),
        },
        {
          path: '/admin-view',
          element: (
            <ProtectedRoute>
              <AdminView />
            </ProtectedRoute>
          ),
        },
        {
          path: '/',
          element: (
            <PublicRoute>
              <LandingPage />
            </PublicRoute>
          ),
        },
        {
          path: '*',
          element: (
            <ProtectedRoute>
              <Navigate to="/home" replace />
            </ProtectedRoute>
          ),
        },
      ],
    },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

function Router() {
  return <RouterProvider router={router} />;
}

export default Router;
