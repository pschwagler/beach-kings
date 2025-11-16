import { useState, useEffect } from 'react';
import App from './App.jsx';
import WhatsAppPage from './components/WhatsAppPage.jsx';

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

  // Simple router based on pathname
  if (currentPath === '/whatsapp') {
    return <WhatsAppPage />;
  }

  // Default to main app
  return <App />;
}

export default Router;

