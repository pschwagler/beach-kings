// Skeleton loading components for various league sections
import { Plus } from 'lucide-react';

// Rankings Table Skeleton
export function RankingsTableSkeleton() {
  return (
    <div className="rankings-table-wrapper">
      <table className="rankings-table-modern">
        <thead>
          <tr>
            <th className="rank-number-header">
              <span className="th-content skeleton-text" style={{ width: '40px' }}></span>
            </th>
            <th className="sticky-col">
              <span className="th-content skeleton-text" style={{ width: '120px' }}></span>
            </th>
            <th>
              <span className="th-content skeleton-text" style={{ width: '60px' }}></span>
            </th>
            <th>
              <span className="th-content skeleton-text" style={{ width: '60px' }}></span>
            </th>
            <th>
              <span className="th-content skeleton-text" style={{ width: '60px' }}></span>
            </th>
            <th>
              <span className="th-content skeleton-text" style={{ width: '70px' }}></span>
            </th>
            <th>
              <span className="th-content skeleton-text" style={{ width: '50px' }}></span>
            </th>
            <th>
              <span className="th-content skeleton-text" style={{ width: '60px' }}></span>
            </th>
            <th>
              <span className="th-content skeleton-text" style={{ width: '80px' }}></span>
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }).map((_, idx) => (
            <tr key={idx} className="rankings-row">
              <td className="rank-number-cell">
                <div className="skeleton-box" style={{ width: '24px', height: '24px', margin: '0 auto' }}></div>
              </td>
              <td className="sticky-col rankings-name-cell">
                <span className="player-name-modern">
                  <div className="skeleton-avatar"></div>
                  <span className="skeleton-text" style={{ width: '120px', display: 'inline-block' }}></span>
                </span>
              </td>
              <td className="rankings-stat-cell">
                <div className="skeleton-text" style={{ width: '40px' }}></div>
              </td>
              <td className="rankings-stat-cell">
                <div className="skeleton-text" style={{ width: '50px' }}></div>
              </td>
              <td className="rankings-stat-cell">
                <div className="skeleton-text" style={{ width: '30px' }}></div>
              </td>
              <td className="rankings-stat-cell">
                <div className="skeleton-text" style={{ width: '50px' }}></div>
              </td>
              <td className="rankings-stat-cell">
                <div className="skeleton-text" style={{ width: '30px' }}></div>
              </td>
              <td className="rankings-stat-cell">
                <div className="skeleton-text" style={{ width: '30px' }}></div>
              </td>
              <td className="rankings-stat-cell">
                <div className="skeleton-text" style={{ width: '50px' }}></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Matches Table Skeleton
export function MatchesTableSkeleton({ isLeagueMember = false }) {
  return (
    <div className="matches-container">
      {/* Add Matches Card - Disabled during loading */}
      {isLeagueMember && (
        <div className="add-matches-section">
          <button 
            className="add-matches-card"
            disabled
            style={{ pointerEvents: 'none', opacity: 0.6, cursor: 'not-allowed' }}
          >
            <div className="add-matches-icon">
              <Plus size={24} />
            </div>
            <h2 className="add-matches-title">Add Games</h2>
            <p className="add-matches-description">
              Click to log a new match and start a session.
            </p>
          </button>
        </div>
      )}

      {/* Match Cards Skeleton */}
      <div className="match-cards" style={{ marginTop: '24px' }}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="match-card">
            <div className="match-team">
              <div className="team-players">
                <span className="skeleton-text" style={{ width: '80px', height: '18px', display: 'inline-block', marginRight: '8px' }}></span>
                <span className="skeleton-text" style={{ width: '80px', height: '18px', display: 'inline-block' }}></span>
              </div>
              <div className="team-score">
                <div className="skeleton-box" style={{ width: '30px', height: '30px', borderRadius: '4px' }}></div>
              </div>
            </div>
            <div className="match-team">
              <div className="team-players">
                <span className="skeleton-text" style={{ width: '80px', height: '18px', display: 'inline-block', marginRight: '8px' }}></span>
                <span className="skeleton-text" style={{ width: '80px', height: '18px', display: 'inline-block' }}></span>
              </div>
              <div className="team-score">
                <div className="skeleton-box" style={{ width: '30px', height: '30px', borderRadius: '4px' }}></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Signup List Skeleton
export function SignupListSkeleton() {
  return (
    <div className="league-signups-list">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="league-signup-row">
          <div className="league-signup-info">
            <div className="league-signup-main">
              <div className="league-signup-details">
                <div className="league-signup-title">
                  <div className="skeleton-text" style={{ width: '200px', height: '20px' }}></div>
                </div>
                <div className="league-signup-meta">
                  <span className="league-signup-meta-item">
                    <div className="skeleton-box" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '4px', verticalAlign: 'middle' }}></div>
                    <div className="skeleton-text" style={{ width: '60px', height: '14px', display: 'inline-block' }}></div>
                  </span>
                  <span className="league-signup-meta-item">
                    <div className="skeleton-box" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '4px', verticalAlign: 'middle' }}></div>
                    <div className="skeleton-text" style={{ width: '70px', height: '14px', display: 'inline-block' }}></div>
                  </span>
                  <span className="league-signup-meta-item">
                    <div className="skeleton-box" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '4px', verticalAlign: 'middle' }}></div>
                    <div className="skeleton-text" style={{ width: '80px', height: '14px', display: 'inline-block' }}></div>
                  </span>
                </div>
              </div>
              <div className="league-signup-actions">
                <div className="skeleton-box" style={{ width: '80px', height: '32px', borderRadius: '6px', display: 'inline-block', marginRight: '8px' }}></div>
                <div className="skeleton-box" style={{ width: '60px', height: '32px', borderRadius: '6px', display: 'inline-block' }}></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// League Details Skeleton
export function LeagueDetailsSkeleton() {
  return (
    <div className="league-details-new">
      {/* Description Section */}
      <div className="league-description-section">
        <div className="league-description-display">
          <div className="skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '8px' }}></div>
          <div className="skeleton-text" style={{ width: '100%', height: '20px', marginBottom: '8px' }}></div>
          <div className="skeleton-text" style={{ width: '80%', height: '20px' }}></div>
        </div>
      </div>

      {/* Players Section */}
      <div className="league-players-section">
        <div className="league-section-header">
          <h3 className="league-section-title">
            <div className="skeleton-box" style={{ width: '18px', height: '18px', display: 'inline-block', marginRight: '8px', verticalAlign: 'middle' }}></div>
            <div className="skeleton-text" style={{ width: '80px', height: '20px', display: 'inline-block' }}></div>
          </h3>
          <div className="skeleton-box" style={{ width: '120px', height: '32px', borderRadius: '6px' }}></div>
        </div>
        <div className="league-players-list">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="league-player-row">
              <div className="league-player-info">
                <div className="skeleton-text" style={{ width: '150px', height: '20px' }}></div>
              </div>
              <div className="league-player-actions">
                <div className="skeleton-box" style={{ width: '100px', height: '32px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '24px', height: '24px', borderRadius: '4px' }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seasons Section */}
      <div className="league-seasons-section">
        <div className="league-section-header">
          <h3 className="league-section-title">
            <div className="skeleton-box" style={{ width: '18px', height: '18px', display: 'inline-block', marginRight: '8px', verticalAlign: 'middle' }}></div>
            <div className="skeleton-text" style={{ width: '80px', height: '20px', display: 'inline-block' }}></div>
          </h3>
          <div className="skeleton-box" style={{ width: '120px', height: '32px', borderRadius: '6px' }}></div>
        </div>
        <div className="league-seasons-grid">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="league-season-item">
              <div className="league-season-content">
                <h4 className="league-season-name">
                  <div className="skeleton-text" style={{ width: '120px', height: '20px' }}></div>
                </h4>
                <p className="league-season-dates">
                  <span className="skeleton-text" style={{ width: '180px', height: '16px', display: 'inline-block' }}></span>
                </p>
              </div>
              <div className="skeleton-box" style={{ width: '60px', height: '24px', borderRadius: '12px' }}></div>
            </div>
          ))}
        </div>
      </div>

      {/* League Info Section */}
      <div className="league-info-section">
        <h3 className="league-section-title">
          <div className="skeleton-text" style={{ width: '150px', height: '20px' }}></div>
        </h3>
        <div className="league-info-list">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="league-info-item">
              <div className="skeleton-text" style={{ width: '100px', height: '20px', display: 'inline-block', marginRight: '16px' }}></div>
              <div className="skeleton-box" style={{ width: '150px', height: '32px', borderRadius: '4px', display: 'inline-block' }}></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Sidebar Title Skeleton
export function LeagueSidebarTitleSkeleton() {
  return (
    <div className="league-sidebar-title-wrapper-container">
      <div className="league-sidebar-title-wrapper" style={{ pointerEvents: 'none', cursor: 'default' }}>
        <h1 className="league-sidebar-title">
          <div className="skeleton-text" style={{ width: '150px', height: '20px' }}></div>
        </h1>
        <div className="skeleton-box" style={{ width: '16px', height: '16px', borderRadius: '2px' }}></div>
      </div>
    </div>
  );
}

