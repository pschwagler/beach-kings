'use client';

import { forwardRef } from 'react';
import { Check, Square } from 'lucide-react';
import { GENDER_FILTER_OPTIONS, LEVEL_FILTER_OPTIONS } from '../../utils/playerFilterOptions';

/**
 * Reusable popover content for filtering players by Location, League, Gender, and Level.
 * Used by SessionPlayersAddPanel; can be reused on other "find players" screens.
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
  },
  ref
) {
  return (
    <div
      ref={ref}
      id="session-players-filters-popover"
      className="session-players-filters-popover"
      role="dialog"
      aria-label="Filter players"
    >
      <div className="session-players-filters-panel">
        <div className="session-players-filter-multiselect" role="group" aria-label="Location filter">
          <div className="session-players-filter-multiselect-label">Location</div>
          <ul className="session-players-filter-multiselect-list">
            {locations.map((loc) => {
              const selected = locationIds.includes(loc.id);
              return (
                <li key={loc.id}>
                  <button
                    type="button"
                    className={`session-players-filter-multiselect-option ${selected ? 'selected' : ''}`}
                    onClick={() => onToggleFilter('location', loc.id)}
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Remove' : 'Add'} ${loc.name || loc.id} filter`}
                  >
                    <span className="session-players-filter-multiselect-check" aria-hidden="true">
                      {selected ? (
                        <Check size={14} strokeWidth={2.5} />
                      ) : (
                        <Square size={14} strokeWidth={2} />
                      )}
                    </span>
                    <span>{loc.name || loc.id}</span>
                  </button>
                </li>
              );
            })}
            {locations.length === 0 && (
              <li className="session-players-filter-multiselect-empty">No locations</li>
            )}
          </ul>
        </div>
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
