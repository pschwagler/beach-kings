'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { getAdminAllSuggestions } from '../../../services/api';
import { formatDate } from '../adminUtils';
import SuggestionDiffRow from './SuggestionDiffRow';

/**
 * Panel showing all pending court edit suggestions across all courts.
 * Clicking a row expands an inline diff panel for cherry-pick review.
 */
interface EditSuggestionsPanelProps {
  onCountChange?: (count: number) => void;
}

export default function EditSuggestionsPanel({ onCountChange }: EditSuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const pageSize = 25;

  const load = useCallback(async (p = page) => {
    try {
      setLoading(true);
      const data = await getAdminAllSuggestions({ status: 'pending', page: p, page_size: pageSize });
      setSuggestions(data.items);
      setTotal(data.total);
      onCountChange?.(data.total);
    } catch (err) {
      console.error('Error loading suggestions:', err);
    } finally {
      setLoading(false);
    }
  }, [page, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolved = (suggestionId) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    setTotal((prev) => {
      const next = prev - 1;
      onCountChange?.(next);
      return next;
    });
    setExpandedId(null);
  };

  /** Summarize changed fields as a list of chips. */
  const renderChanges = (changes) => {
    if (!changes || typeof changes !== 'object') return 'N/A';
    const keys = Object.keys(changes);
    return (
      <div className="admin-suggestion-changes">
        {keys.map((k) => (
          <span key={k} className="admin-suggestion-changes__chip">{k.replace(/_/g, ' ')}</span>
        ))}
      </div>
    );
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <div className="admin-section-header">
        <h2>Edit Suggestions</h2>
        <button
          onClick={() => load()}
          disabled={loading}
          className="admin-refresh-btn"
          aria-label="Refresh suggestions"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {loading ? (
        <p>Loading suggestions...</p>
      ) : suggestions.length === 0 ? (
        <p>No pending edit suggestions.</p>
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
  suggestion: any;
  isExpanded: boolean;
  onRowClick: () => void;
  onResolved: (id: any) => void;
  renderChanges: (changes: any) => JSX.Element | string;
}

function SuggestionRows({ suggestion, isExpanded, onRowClick, onResolved, renderChanges }: SuggestionRowsProps) {
  return (
    <>
      <tr
        className={`admin-courts-row--clickable ${isExpanded ? 'admin-courts-row--expanded' : ''}`}
        onClick={onRowClick}
      >
        <td className="feedback-text-cell">
          <div className="feedback-text">{suggestion.court_name}</div>
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
