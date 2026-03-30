'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Settings, MapPin, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { getUserLeagues } from '../../services/api';
import NavBar from '../layout/NavBar';
import AdminDashboardTab from './AdminDashboardTab';
import AdminSettingsTab from './AdminSettingsTab';
import AdminCourtsTab from './AdminCourtsTab';
import AdminFeedbackTab from './AdminFeedbackTab';
import { League } from '../../types';
import './AdminView.css';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'courts', label: 'Courts', icon: MapPin },
  { key: 'feedback', label: 'Feedback', icon: MessageSquare },
];

/**
 * Admin view shell — horizontal tab bar + lazy-rendered tab content.
 */
export default function AdminView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [userLeagues, setUserLeagues] = useState<League[]>([]);

  const activeTab = searchParams.get('tab') || 'dashboard';

  const setActiveTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (isAuthenticated) {
      getUserLeagues()
        .then(setUserLeagues)
        .catch(() => setUserLeagues([]));
    }
  }, [isAuthenticated]);

  const handleSignOut = async () => {
    try { await logout(); } catch { /* noop */ }
    router.push('/');
  };

  const handleLeaguesMenuClick = (action: string, leagueId: number | null = null) => {
    if (action === 'view-league' && leagueId) router.push(`/league/${leagueId}`);
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <AdminDashboardTab />;
      case 'settings': return <AdminSettingsTab />;
      case 'courts': return <AdminCourtsTab />;
      case 'feedback': return <AdminFeedbackTab />;
      default: return <AdminDashboardTab />;
    }
  };

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
        onLeaguesMenuClick={handleLeaguesMenuClick}
      />
      <div className="container">
        <div className="admin-view-container">
          <h1 className="admin-view-title">Admin Panel</h1>

          <div className="admin-tab-bar">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className={`admin-tab-btn ${activeTab === key ? 'admin-tab-btn--active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="admin-tab-content">
            {renderTab()}
          </div>
        </div>
      </div>
    </>
  );
}
