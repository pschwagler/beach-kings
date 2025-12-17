import { ChevronDown } from 'lucide-react';
import { formatDateRange } from '../../league/utils/leagueUtils';

/**
 * Component to render season dropdown with complex conditional logic
 * Extracted from AddMatchModal to simplify the main component
 */
export default function SeasonDropdown({
  loadingSeason,
  hasActiveSession,
  allSeasons,
  selectedSeasonId,
  isSeasonDisabled,
  isSeasonDropdownOpen,
  setIsSeasonDropdownOpen,
  setSelectedSeasonId,
  setActiveSeason,
  formError,
  setFormError,
  onSeasonChange,
  isSeasonActive,
  seasonDropdownRef
}) {
  if (loadingSeason) {
    return <span className="active-season-inline-text">Loading...</span>;
  }

  // Always show all seasons
  const seasonsToShow = allSeasons;
  const selectedSeason = seasonsToShow.find(s => s.id === selectedSeasonId);

  // If no seasons at all
  if (allSeasons.length === 0) {
    return <span className="active-season-inline-text">No seasons available</span>;
  }

  // If exactly one season, show it
  if (allSeasons.length === 1) {
    const season = allSeasons[0];
    return (
      <span className="active-season-inline-text">
        <span className="season-name">{season.name || `Season ${season.id}`}</span>
        {season.start_date && season.end_date && (
          <span className="season-dates">{formatDateRange(season.start_date, season.end_date)}</span>
        )}
      </span>
    );
  }

  // If season is disabled (from session), show as text
  if (isSeasonDisabled && selectedSeasonId) {
    const season = allSeasons.find(s => s.id === selectedSeasonId);
    if (season) {
      return (
        <span className="active-season-inline-text">
          <span className="season-name">{season.name || `Season ${selectedSeasonId}`}</span>
          {season.start_date && season.end_date && (
            <span className="season-dates">{formatDateRange(season.start_date, season.end_date)}</span>
          )}
        </span>
      );
    }
  }

  // Multiple seasons or no active session - show dropdown
  return (
    <>
      <div
        className={`season-dropdown-trigger compact ${isSeasonDropdownOpen ? 'open' : ''} ${!selectedSeasonId ? 'placeholder required' : ''} ${formError === 'Please select a season' ? 'error' : ''} ${isSeasonDisabled ? 'disabled' : ''}`}
        onClick={() => !isSeasonDisabled && setIsSeasonDropdownOpen(!isSeasonDropdownOpen)}
      >
        {selectedSeasonId
          ? <span>{selectedSeason?.name || `Season ${selectedSeasonId}`}</span>
          : <div><span>Select season</span><span className="required-asterisk">*</span></div>}
        {!isSeasonDisabled && <ChevronDown size={14} className={isSeasonDropdownOpen ? 'rotate-180' : ''} />}
      </div>
      {isSeasonDropdownOpen && !isSeasonDisabled && (
        <div className="season-dropdown-menu">
          {seasonsToShow.map((season) => {
            const isActive = isSeasonActive(season);
            return (
              <div
                key={season.id}
                className={`season-dropdown-option ${selectedSeasonId === season.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedSeasonId(season.id);
                  setActiveSeason(season);
                  setIsSeasonDropdownOpen(false);
                  // Update context season selection when user changes season in modal
                  if (onSeasonChange) {
                    onSeasonChange(season.id);
                  }
                  // Clear error when season is selected
                  if (formError === 'Please select a season') {
                    setFormError(null);
                  }
                }}
              >
                <span className="season-name">{season.name || `Season ${season.id}`}</span>
                {season.start_date && season.end_date && (
                  <span className="season-dates">{formatDateRange(season.start_date, season.end_date)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
