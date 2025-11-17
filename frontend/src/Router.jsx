import { useState, useEffect } from 'react';
import App from './App.jsx';
import WhatsAppPage from './components/WhatsAppPage.jsx';
import LeagueDashboard from './components/league/LeagueDashboard.jsx';

function Router() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    // Handle browser back/forward buttons
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Extract league ID from path if it matches /league/:id
  const leagueMatch = currentPath.match(/^\/league\/(\d+)$/);
  const leagueId = leagueMatch ? parseInt(leagueMatch[1]) : null;

  // Simple router based on pathname
  if (currentPath === '/whatsapp') {
    return <WhatsAppPage />;
  }

  if (leagueId) {
    return <LeagueDashboard leagueId={leagueId} />;
  }

  // Default to main app
  return <App />;
}

// Export navigation helper function
export const navigateTo = (path) => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export default Router;

