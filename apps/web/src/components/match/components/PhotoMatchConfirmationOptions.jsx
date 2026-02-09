'use client';

/**
 * Season and match date selection for photo match confirmation.
 */
export default function PhotoMatchConfirmationOptions({
  selectedSeasonId,
  onSelectedSeasonIdChange,
  matchDate,
  onMatchDateChange,
  seasons = [],
  disabled,
}) {
  return (
    <div className="confirmation-options">
      <div className="option-row">
        <label>Season</label>
        <select
          value={selectedSeasonId || ''}
          onChange={(e) => onSelectedSeasonIdChange(e.target.value ? parseInt(e.target.value) : null)}
          disabled={disabled}
        >
          <option value="">Select season...</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name || `Season ${season.id}`}
            </option>
          ))}
        </select>
      </div>
      <div className="option-row">
        <label>Match Date</label>
        <input
          type="date"
          value={matchDate}
          onChange={(e) => onMatchDateChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
