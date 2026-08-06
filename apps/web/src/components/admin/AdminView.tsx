'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Settings, MapPin, MessageSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useApp } from '../../contexts/AppContext';
import NavBar from '../layout/NavBar';
import AdminDashboardTab from './AdminDashboardTab';
import AdminSettingsTab from './AdminSettingsTab';
import AdminCourtsTab from './AdminCourtsTab';
import AdminFeedbackTab from './AdminFeedbackTab';
import AdminModerationTab from './AdminModerationTab';
import './AdminView.css';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'courts', label: 'Courts', icon: MapPin },
  { key: 'feedback', label: 'Feedback', icon: MessageSquare },
  { key: 'moderation', label: 'Moderation', icon: ShieldCheck },
] as const;

type AdminTab = (typeof TABS)[number]['key'];

function isAdminTab(value: string | null): value is AdminTab {
  return TABS.some(({ key }) => key === value);
}

/**
 * Admin view shell — horizontal tab bar + lazy-rendered tab content.
 */
export default function AdminView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { userLeagues } = useApp();

  const requestedTab = searchParams.get('tab');
  const activeTab: AdminTab = isAdminTab(requestedTab) ? requestedTab : 'dashboard';

  const setActiveTab = (key: AdminTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

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
      case 'moderation': return <AdminModerationTab />;
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

          <nav className="admin-tab-bar" aria-label="Admin navigation">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-current={activeTab === key ? 'page' : undefined}
                className={`admin-tab-btn ${activeTab === key ? 'admin-tab-btn--active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="admin-tab-content">
            {renderTab()}
          </div>
        </div>
      </div>
    </>
  );
}
