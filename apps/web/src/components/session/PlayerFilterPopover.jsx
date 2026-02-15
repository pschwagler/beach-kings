'use client';

import { forwardRef, useMemo } from 'react';
import { Check, Square } from 'lucide-react';
import { GENDER_FILTER_OPTIONS, LEVEL_FILTER_OPTIONS } from '../../utils/playerFilterOptions';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';

/**
 * Reusable popover content for filtering players by Location, League, Gender, and Level.
 * Location uses a Tom Select-style searchable multi-select; other filters use checkboxes.
 */
const PlayerFilterPopover = forwardRef(function PlayerFilterPopover(
  {
    locationIds = [],
    leagueIds = [],
    genderFilters = [],
    levelFilters = [],
    locations = [],
    leagues = [],
    onToggleFilter,
    userLocationId = null,
  },
  ref
) {
  const locationOptions = useMemo(
    () => {
      const opts = locations.map((loc) => ({ id: loc.id, label: loc.name || loc.id }));
      if (!userLocationId) return opts;
      return opts.sort((a, b) => {
        if (a.id === userLocationId) return -1;
        if (b.id === userLocationId) return 1;
        return 0;
      });
    },
    [locations, userLocationId]
  );

  return (
    <div
      ref={ref}
      id="session-players-filters-popover"
      className="session-players-filters-popover"
      role="dialog"
      aria-label="Filter players"
    >
      <div className="session-players-filters-panel">
        <SearchableMultiSelect
          label="Location"
          options={locationOptions}
          selectedIds={locationIds}
          onToggle={(id) => onToggleFilter('location', id)}
          placeholder="Search locations..."
        />
        <div className="session-players-filter-multiselect" role="group" aria-label="League filter">
          <div className="session-players-filter-multiselect-label">League</div>
          <ul className="session-players-filter-multiselect-list">
            {leagues.map((l) => {
              const selected = leagueIds.includes(l.id);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`session-players-filter-multiselect-option ${selected ? 'selected' : ''}`}
                    onClick={() => onToggleFilter('league', l.id)}
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Remove' : 'Add'} ${l.name || l.id} filter`}
                  >
                    <span className="session-players-filter-multiselect-check" aria-hidden="true">
                      {selected ? (
                        <Check size={14} strokeWidth={2.5} />
                      ) : (
                        <Square size={14} strokeWidth={2} />
                      )}
                    </span>
                    <span>{l.name || l.id}</span>
                  </button>
                </li>
              );
            })}
            {leagues.length === 0 && (
              <li className="session-players-filter-multiselect-empty">No leagues</li>
            )}
          </ul>
        </div>
        <div className="session-players-filter-multiselect" role="group" aria-label="Gender filter">
          <div className="session-players-filter-multiselect-label">Gender</div>
          <ul className="session-players-filter-multiselect-list">
            {GENDER_FILTER_OPTIONS.filter((opt) => opt.value).map((opt) => {
              const selected = genderFilters.includes(opt.value);
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    className={`session-players-filter-multiselect-option ${selected ? 'selected' : ''}`}
                    onClick={() => onToggleFilter('gender', opt.value)}
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Remove' : 'Add'} ${opt.label} filter`}
                  >
                    <span className="session-players-filter-multiselect-check" aria-hidden="true">
                      {selected ? (
                        <Check size={14} strokeWidth={2.5} />
                      ) : (
                        <Square size={14} strokeWidth={2} />
                      )}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="session-players-filter-multiselect" role="group" aria-label="Level filter">
          <div className="session-players-filter-multiselect-label">Level</div>
          <ul className="session-players-filter-multiselect-list">
            {LEVEL_FILTER_OPTIONS.filter((opt) => opt.value).map((opt) => {
              const selected = levelFilters.includes(opt.value);
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    className={`session-players-filter-multiselect-option ${selected ? 'selected' : ''}`}
                    onClick={() => onToggleFilter('level', opt.value)}
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Remove' : 'Add'} ${opt.label} filter`}
                  >
                    <span className="session-players-filter-multiselect-check" aria-hidden="true">
                      {selected ? (
                        <Check size={14} strokeWidth={2.5} />
                      ) : (
                        <Square size={14} strokeWidth={2} />
                      )}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
});

export default PlayerFilterPopover;
