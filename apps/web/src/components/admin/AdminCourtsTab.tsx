'use client';

import { useState, useEffect } from 'react';
import { ClipboardCheck, FilePenLine, MapPinned } from 'lucide-react';
import { getAdminPendingCourts, getAdminAllSuggestions } from '../../services/api';
import PendingCourtsPanel from './courts/PendingCourtsPanel';
import EditSuggestionsPanel from './courts/EditSuggestionsPanel';
import AllCourtsPanel from './courts/AllCourtsPanel';

const SUB_TABS = [
  { key: 'pending', label: 'New courts', description: 'Unpublished drafts', icon: ClipboardCheck },
  { key: 'suggestions', label: 'Suggested edits', description: 'Changes to live courts', icon: FilePenLine },
  { key: 'all', label: 'Court directory', description: 'Find and update any court', icon: MapPinned },
] as const;

type CourtsSubTab = (typeof SUB_TABS)[number]['key'];

/**
 * Courts management tab with 3 pill sub-tabs and badge counts.
 */
export default function AdminCourtsTab() {
  const [activeSubTab, setActiveSubTab] = useState<CourtsSubTab>('pending');
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

  const badgeCounts: Record<string, number | null> = {
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
    <section className="admin-courts-workspace">
      <div className="admin-courts-command-header">
        <div>
          <span className="admin-courts-kicker">Venue operations</span>
          <h2>Court review desk</h2>
          <p>Publish new court drafts, review suggested changes, and maintain the live directory.</p>
        </div>
        <div className="admin-courts-queue-summary" aria-label="Open court work">
          <span><strong>{pendingCount}</strong> {pendingCount === 1 ? 'draft' : 'drafts'}</span>
          <span><strong>{suggestionsCount}</strong> {suggestionsCount === 1 ? 'suggestion' : 'suggestions'}</span>
        </div>
      </div>

      <div className="admin-courts-pills" role="tablist" aria-label="Court management views">
        {SUB_TABS.map(({ key, label, description, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeSubTab === key}
            aria-controls={`admin-courts-panel-${key}`}
            className={`admin-courts-pill ${activeSubTab === key ? 'admin-courts-pill--active' : ''}`}
            onClick={() => setActiveSubTab(key)}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="admin-courts-pill__copy">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            {badgeCounts[key] != null && <span className="admin-courts-pill__badge">{badgeCounts[key]}</span>}
          </button>
        ))}
      </div>
      <div id={`admin-courts-panel-${activeSubTab}`} role="tabpanel">
        {renderSubTab()}
      </div>
    </section>
  );
}
