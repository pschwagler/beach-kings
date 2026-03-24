'use client';

import { useState } from 'react';
import { updateCourtDiscovery, resolveCourtEditSuggestion } from '../../../services/api';

const BOOL_FIELDS = new Set([
  'is_free', 'has_lights', 'has_restrooms', 'has_parking', 'nets_provided',
]);

const SURFACE_OPTIONS = [
  { value: '', label: '\u2014' },
  { value: 'sand', label: 'Sand' },
  { value: 'indoor_sand', label: 'Indoor Sand' },
  { value: 'grass', label: 'Grass' },
  { value: 'hard', label: 'Hard Court' },
];

/**
 * Humanize a snake_case field name into a label.
 */
function labelFor(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a value for display (current column).
 */
function displayValue(val) {
  if (val === null || val === undefined || val === '') return '\u2014';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

/**
 * Expandable diff panel for a single edit suggestion.
 *
 * Shows current vs proposed values per changed field. Admin can cherry-pick
 * fields, edit proposed values, then apply selected or reject all.
 */
interface SuggestionDiffRowProps {
  suggestion: any;
  onResolved?: (id: any) => void;
}

export default function SuggestionDiffRow({ suggestion, onResolved }: SuggestionDiffRowProps) {
  const { changes, current, court_id, id: suggestionId } = suggestion;
  const changedKeys = Object.keys(changes || {});

  // Track which fields are selected (checked)
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(changedKeys.map((k) => [k, true]))
  );

  // Track editable proposed values (pre-filled from suggestion)
  const [proposed, setProposed] = useState(() =>
    Object.fromEntries(changedKeys.map((k) => [k, changes[k]]))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const toggleField = (key) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateProposed = (key, value) => {
    setProposed((prev) => ({ ...prev, [key]: value }));
  };

  /** Apply selected fields to the court, then resolve the suggestion. */
  const handleApply = async () => {
    const selectedFields = {};
    let allSelectedAndUnmodified = true;

    for (const key of changedKeys) {
      if (selected[key]) {
        selectedFields[key] = proposed[key];
        if (proposed[key] !== changes[key]) {
          allSelectedAndUnmodified = false;
        }
      } else {
        allSelectedAndUnmodified = false;
      }
    }

    if (Object.keys(selectedFields).length === 0) {
      setError('Select at least one field to apply.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Apply selected fields to court
      await updateCourtDiscovery(court_id, selectedFields);

      // Resolve suggestion — 'approved' if all fields selected & unmodified,
      // 'partially_applied' if admin cherry-picked or modified values
      const action = allSelectedAndUnmodified ? 'approved' : 'partially_applied';
      await resolveCourtEditSuggestion(suggestionId, action);

      onResolved?.(suggestionId);
    } catch (err) {
      console.error('Error applying suggestion:', err);
      setError(err.response?.data?.detail || 'Failed to apply suggestion.');
    } finally {
      setSaving(false);
    }
  };

  /** Reject all — just mark as rejected. */
  const handleReject = async () => {
    try {
      setSaving(true);
      setError(null);
      await resolveCourtEditSuggestion(suggestionId, 'rejected');
      onResolved?.(suggestionId);
    } catch (err) {
      console.error('Error rejecting suggestion:', err);
      setError(err.response?.data?.detail || 'Failed to reject suggestion.');
    } finally {
      setSaving(false);
    }
  };

  /** Render the input control for a proposed value. */
  const renderInput = (key, value, disabled) => {
    if (BOOL_FIELDS.has(key)) {
      return (
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => updateProposed(key, e.target.checked)}
          className="suggestion-diff__checkbox-input"
        />
      );
    }
    if (key === 'surface_type') {
      return (
        <select
          value={value || ''}
          disabled={disabled}
          onChange={(e) => updateProposed(key, e.target.value)}
          className="suggestion-diff__select"
        >
          {SURFACE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'court_count') {
      return (
        <input
          type="number"
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => updateProposed(key, e.target.value === '' ? null : Number(e.target.value))}
          className="suggestion-diff__input"
          min={0}
        />
      );
    }
    return (
      <input
        type="text"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => updateProposed(key, e.target.value)}
        className="suggestion-diff__input"
      />
    );
  };

  return (
    <div className="suggestion-diff" onClick={(e) => e.stopPropagation()}>
      <div className="suggestion-diff__meta">
        Suggested by: <strong>{suggestion.suggester_name || 'Unknown'}</strong>
        <span className="suggestion-diff__meta-sep">&middot;</span>
        {suggestion.created_at
          ? new Date(suggestion.created_at).toLocaleDateString()
          : 'N/A'}
      </div>

      {error && <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="suggestion-diff__fields">
        {changedKeys.map((key) => {
          const isChecked = selected[key];
          return (
            <div
              key={key}
              className={`suggestion-diff__row ${!isChecked ? 'suggestion-diff__row--dimmed' : ''}`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleField(key)}
                className="suggestion-diff__toggle"
              />
              <span className="suggestion-diff__label">{labelFor(key)}</span>
              <span className="suggestion-diff__current">
                {displayValue(current?.[key])}
              </span>
              <span className="suggestion-diff__arrow">&rarr;</span>
              <div className="suggestion-diff__proposed">
                {renderInput(key, proposed[key], !isChecked)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="suggestion-diff__actions">
        <button
          className="btn-save"
          onClick={handleApply}
          disabled={saving}
        >
          {saving ? 'Applying...' : 'Apply Selected'}
        </button>
        <button
          className="btn-cancel"
          onClick={handleReject}
          disabled={saving}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
