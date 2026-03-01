'use client';

import { useState, useEffect } from 'react';
import { getAdminPendingCourts, getAdminAllSuggestions } from '../../services/api';
import PendingCourtsPanel from './courts/PendingCourtsPanel';
import EditSuggestionsPanel from './courts/EditSuggestionsPanel';
import AllCourtsPanel from './courts/AllCourtsPanel';

const SUB_TABS = [
  { key: 'all', label: 'All Courts' },
  { key: 'pending', label: 'Pending Submissions' },
  { key: 'suggestions', label: 'Edit Suggestions' },
];

/**
 * Courts management tab with 3 pill sub-tabs and badge counts.
 */
export default function AdminCourtsTab() {
  const [activeSubTab, setActiveSubTab] = useState('all');
  const [pendingCount, setPendingCount] = useState(0);
  const [suggestionsCount, setSuggestionsCount] = useState(0);

  useEffect(() => {
    // Fetch badge counts
    getAdminPendingCourts()
      .then((data) => setPendingCount(data.length))
      .catch(() => {});
    getAdminAllSuggestions({ status: 'pending', page_size: 1 })
      .then((data) => setSuggestionsCount(data.total))
      .catch(() => {});
  }, []);

  const badgeCounts = {
    pending: pendingCount,
    suggestions: suggestionsCount,
    all: null,
  };

  const renderSubTab = () => {
    switch (activeSubTab) {
      case 'pending':
        return <PendingCourtsPanel onCountChange={setPendingCount} />;
      case 'suggestions':
        return <EditSuggestionsPanel onCountChange={setSuggestionsCount} />;
      case 'all':
        return <AllCourtsPanel />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="admin-courts-pills">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`admin-courts-pill ${activeSubTab === key ? 'admin-courts-pill--active' : ''}`}
            onClick={() => setActiveSubTab(key)}
          >
            <span>{label}</span>
            {badgeCounts[key] != null && (
              <span className="admin-courts-pill__badge">{badgeCounts[key]}</span>
            )}
          </button>
        ))}
      </div>
      {renderSubTab()}
    </>
  );
}
