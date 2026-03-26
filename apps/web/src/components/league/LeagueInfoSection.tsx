import type { League } from '../../types';
import { LEVEL_OPTIONS } from './utils/leagueUtils';
import { updateLeague, setLeagueHomeCourts } from '../../services/api';
import { useLeague } from '../../contexts/LeagueContext';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import useHomeCourts from '../../hooks/useHomeCourts';
import CourtSelector from '../court/CourtSelector';

/**
 * League information section showing access, skill level, location,
 * and home courts with admin-editable controls.
 *
 * Admin home court management uses CourtSelector (multi-select mode)
 * with inline pills + dropdown for adding courts.
 *
 * @param {Object} props
 * @param {Object} props.league - League data
 * @param {(league: League) => void} [props.onUpdate] - Called after league update
 */
interface LeagueInfoSectionProps {
  league: League;
  onUpdate?: (updatedLeague: League) => void;
}

export default function LeagueInfoSection({ league, onUpdate }: LeagueInfoSectionProps) {
  const { isLeagueAdmin, leagueId } = useLeague();
  const { locations } = useApp();
  const { showToast } = useToast();

  const {
    homeCourts,
    handleSet: handleSetHomeCourts,
    handleRemove: handleRemoveHomeCourt,
    handleSetPrimary,
  } = useHomeCourts({
    entityId: leagueId,
    initialCourts: (league?.home_courts ?? undefined) as import('../../types').Court[] | undefined,
    api: { set: setLeagueHomeCourts },
  });

  const handleLevelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLevel = e.target.value || null;
    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: league?.name || '',
        description: league?.description || null,
        level: newLevel,
        location_id: league?.location_id || null,
        is_open: league?.is_open ?? true,
        gender: league?.gender || null,
      });
      onUpdate?.(updatedLeague);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      showToast(e2.response?.data?.detail || 'Failed to update skill level', 'error');
      e.target.value = league?.level || '';
    }
  };

  const handleLocationChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocationId = e.target.value || null;
    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: league?.name || '',
        description: league?.description || null,
        level: league?.level || null,
        location_id: newLocationId,
        is_open: league?.is_open ?? true,
        gender: league?.gender || null,
      });
      onUpdate?.(updatedLeague);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      showToast(e2.response?.data?.detail || 'Failed to update location', 'error');
      e.target.value = league?.location_id ? String(league.location_id) : '';
    }
  };

  const handleAccessChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const isOpen = e.target.value === 'open';
    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: league?.name || '',
        description: league?.description || null,
        level: league?.level || null,
        location_id: league?.location_id || null,
        is_open: isOpen,
        gender: league?.gender || null,
      });
      onUpdate?.(updatedLeague);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      showToast(e2.response?.data?.detail || 'Failed to update access', 'error');
      e.target.value = league?.is_open ? 'open' : 'invite-only';
    }
  };

  return (
    <div className="league-info-section">
      <h3 className="league-section-title">League Information</h3>
      <div className="league-info-list">
        <div className="league-info-item">
          <span className="league-info-label">Access:</span>
          {isLeagueAdmin ? (
            <select
              value={league?.is_open ? 'open' : 'invite-only'}
              onChange={handleAccessChange}
              className="league-info-select"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="open">Open</option>
              <option value="invite-only">Invite Only</option>
            </select>
          ) : (
            <span className="league-info-value">{league?.is_open ? 'Open' : 'Invite Only'}</span>
          )}
        </div>
        <div className="league-info-item">
          <span className="league-info-label">Skill Level:</span>
          {isLeagueAdmin ? (
            <select
              value={league?.level || ''}
              onChange={handleLevelChange}
              className="league-info-select"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">None</option>
              {LEVEL_OPTIONS.filter(opt => opt.value && opt.value !== '').map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span className="league-info-value">
              {league?.level ? (LEVEL_OPTIONS.find(opt => opt.value === league.level)?.label || league.level) : 'Not set'}
            </span>
          )}
        </div>
        <div className="league-info-item">
          <span className="league-info-label">Location:</span>
          {isLeagueAdmin ? (
            <select
              value={league?.location_id ? String(league.location_id) : ''}
              onChange={handleLocationChange}
              className="league-info-select"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">None</option>
              {locations.map(loc => (
                <option key={loc.id} value={String(loc.id)}>{loc.name}</option>
              ))}
            </select>
          ) : (
            <span className="league-info-value">
              {league?.location_id ? (locations.find(loc => loc.id === league.location_id)?.name || `Location ${league.location_id}`) : 'Not set'}
            </span>
          )}
        </div>
        <div className="league-info-item">
          <span className="league-info-label">Home Courts:</span>
          <div className="league-info-value" style={{ flex: 1 }}>
            {isLeagueAdmin ? (
              <CourtSelector
                mode="multi"
                selectedCourts={homeCourts as { id: number | string; name?: string; address?: string }[]}
                onSet={handleSetHomeCourts as (courts: { id: number | string; name?: string; address?: string }[]) => void}
                onRemove={handleRemoveHomeCourt}
                onSetPrimary={handleSetPrimary}
                preFilterLocationId={league?.location_id ?? undefined}
              />
            ) : homeCourts.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {homeCourts.map((court, i) => (
                  <span
                    key={court.id}
                    className={`league-info__court-pill${i === 0 && homeCourts.length > 1 ? ' league-info__court-pill--primary' : ''}`}
                  >
                    {i === 0 && homeCourts.length > 1 && (
                      <span className="league-info__court-pill-star--active" style={{ display: 'flex', alignItems: 'center' }}>
                        &#9733;
                      </span>
                    )}
                    {court.name}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ color: 'var(--gray-600)' }}>None set</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
