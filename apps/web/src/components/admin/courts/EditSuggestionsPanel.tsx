'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader, RefreshCw } from 'lucide-react';
import { getAdminAllSuggestions } from '../../../services/api';
import { formatDate } from '../adminUtils';
import SuggestionDiffRow from './SuggestionDiffRow';

interface CourtSuggestion {
  id: number;
  court_id: number;
  court_name?: string;
  suggester_name?: string;
  changes?: Record<string, unknown>;
  current?: Record<string, unknown>;
  created_at?: string;
  note?: string | null;
}

/**
 * Panel showing all pending court edit suggestions across all courts.
 * Clicking a row expands an inline diff panel for cherry-pick review.
 */
interface EditSuggestionsPanelProps {
  onCountChange?: (count: number) => void;
}

export default function EditSuggestionsPanel({ onCountChange }: EditSuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<CourtSuggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const pageSize = 25;

  const load = useCallback(async (p = page) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminAllSuggestions({ status: 'pending', page: p, page_size: pageSize });
      setSuggestions(data.items);
      setTotal(data.total);
      onCountChange?.(data.total);
    } catch (err) {
      console.error('Error loading suggestions:', err);
      setError('Could not load edit requests. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [page, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolved = (suggestionId: number) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    setTotal((prev) => {
      const next = prev - 1;
      onCountChange?.(next);
      return next;
    });
    setExpandedId(null);
  };

  /** Summarize changed fields as a list of chips. */
  const renderChanges = (changes: Record<string, unknown> | null | undefined) => {
    if (!changes || typeof changes !== 'object') return 'N/A';
    const keys = Object.keys(changes);
    const displayKeys = keys.includes('latitude') && keys.includes('longitude')
      ? [...keys.filter((key) => key !== 'latitude' && key !== 'longitude'), 'map pin']
      : keys;
    return (
      <div className="admin-suggestion-changes">
        {displayKeys.map((k) => (
          <span key={k} className="admin-suggestion-changes__chip">{k.replace(/_/g, ' ')}</span>
        ))}
      </div>
    );
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <div className="admin-section-header admin-section-header--court">
        <div>
          <span className="admin-section-eyebrow">Community input</span>
          <h3>Suggested edits to live courts</h3>
          <p>Applying selected changes updates the live court immediately. There is no separate publish step.</p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="admin-refresh-btn"
          aria-label="Refresh edit requests"
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="admin-courts-alert admin-courts-alert--error" role="alert">{error} <button type="button" onClick={() => load()}>Try again</button></div>
      ) : loading && suggestions.length === 0 ? (
        <div className="admin-courts-loading"><Loader size={20} className="spinning" /> Loading edit requests…</div>
      ) : suggestions.length === 0 ? (
        <div className="admin-courts-empty"><CheckCircle2 size={30} /><strong>All suggested edits are reviewed</strong><span>New suggestions for live courts will appear here.</span></div>
      ) : (
        <>
          <div className="admin-feedback-table-container">
            <table className="admin-feedback-table">
              <thead>
                <tr>
                  <th>Court</th>
                  <th>Submitted By</th>
                  <th>Changed Fields</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <SuggestionRows
                    key={s.id}
                    suggestion={s}
                    isExpanded={expandedId === s.id}
                    onRowClick={() => setExpandedId((prev) => (prev === s.id ? null : s.id))}
                    onResolved={handleResolved}
                    renderChanges={renderChanges}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="admin-courts-pagination">
              <span>Page {page} of {totalPages} ({total} total)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>Previous</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * Renders a suggestion summary row + optional expanded SuggestionDiffRow below it.
 */
interface SuggestionRowsProps {
  suggestion: CourtSuggestion;
  isExpanded: boolean;
  onRowClick: () => void;
  onResolved: (id: number) => void;
  renderChanges: (changes: Record<string, unknown> | null | undefined) => React.ReactElement | string;
}

function SuggestionRows({ suggestion, isExpanded, onRowClick, onResolved, renderChanges }: SuggestionRowsProps) {
  return (
    <>
      <tr
        className={`admin-courts-row--clickable ${isExpanded ? 'admin-courts-row--expanded' : ''}`}
        onClick={onRowClick}
      >
        <td className="feedback-text-cell">
          <button type="button" className="admin-court-row-trigger" onClick={(event) => { event.stopPropagation(); onRowClick(); }} aria-expanded={isExpanded}>
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            <span>{suggestion.court_name}</span>
          </button>
        </td>
        <td>{suggestion.suggester_name || 'Unknown'}</td>
        <td>{renderChanges(suggestion.changes)}</td>
        <td>{formatDate(suggestion.created_at)}</td>
      </tr>
      {isExpanded && (
        <tr className="admin-court-edit-row">
          <td colSpan={4}>
            <SuggestionDiffRow
              suggestion={suggestion}
              onResolved={onResolved}
            />
          </td>
        </tr>
      )}
    </>
  );
}
