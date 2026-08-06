'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import {
  adminApproveCourt,
  adminRejectCourt,
  getAdminPendingCourts,
  getCourtDetailById,
} from '../../../services/api';
import type { Court } from '../../../types';
import { formatDate } from '../adminUtils';
import CourtEditRow, { type AdminCourt, type CourtPhoto, type CourtReview } from './CourtEditRow';

interface PendingCourt extends AdminCourt {
  id: number;
  name?: string;
  address?: string;
  created_at?: string;
  surface_type?: string;
  court_count?: number;
  submitter_name?: string;
}

interface PendingCourtsPanelProps {
  onCountChange?: (count: number) => void;
}

function errorMessage(error: unknown, fallback: string) {
  const apiError = error as { response?: { data?: { detail?: string } } };
  return apiError.response?.data?.detail || fallback;
}

/** Queue-first review flow for new court submissions. */
export default function PendingCourtsPanel({ onCountChange }: PendingCourtsPanelProps) {
  const [courts, setCourts] = useState<PendingCourt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [courtDetail, setCourtDetail] = useState<Court | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [rejectConfirmId, setRejectConfirmId] = useState<number | null>(null);
  const [discardConfirmId, setDiscardConfirmId] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminPendingCourts();
      setCourts(data);
      onCountChange?.(data.length);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load the review queue. Try refreshing.'));
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleReview = async (courtId: number) => {
    setRejectConfirmId(null);
    setDiscardConfirmId(null);
    setHasUnsavedChanges(false);
    setError(null);
    if (expandedId === courtId) {
      setExpandedId(null);
      setCourtDetail(null);
      return;
    }

    setExpandedId(courtId);
    setCourtDetail(null);
    try {
      setDetailLoading(true);
      setCourtDetail(await getCourtDetailById(courtId, { bustCache: true }));
    } catch (detailError) {
      setError(errorMessage(detailError, 'Could not load this court’s full details.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const removeResolvedCourt = (courtId: number) => {
    setCourts((current) => {
      const next = current.filter((court) => court.id !== courtId);
      onCountChange?.(next.length);
      return next;
    });
    setExpandedId(null);
    setCourtDetail(null);
    setRejectConfirmId(null);
    setDiscardConfirmId(null);
    setHasUnsavedChanges(false);
  };

  const handleAction = async (court: PendingCourt, action: 'approve' | 'reject') => {
    if (action === 'reject' && rejectConfirmId !== court.id) {
      setRejectConfirmId(court.id);
      return;
    }

    try {
      setActionId(court.id);
      setError(null);
      setNotice(null);
      if (action === 'approve') await adminApproveCourt(court.id);
      else await adminRejectCourt(court.id);
      removeResolvedCourt(court.id);
      setNotice(`${court.name || 'Court'} was ${action === 'approve' ? 'published to the directory' : 'rejected'}.`);
    } catch (actionError) {
      setError(errorMessage(actionError, action === 'approve' ? 'Could not publish this court.' : 'Could not reject this draft.'));
    } finally {
      setActionId(null);
    }
  };

  const handleCourtUpdated = (updated: AdminCourt) => {
    setCourts((current) => current.map((court) => (
      court.id === updated.id ? { ...court, ...updated } as PendingCourt : court
    )));
    setCourtDetail((current) => (
      current?.id === updated.id ? { ...current, ...updated } as Court : current
    ));
    setNotice(`${updated.name || 'Court'} was updated. It still needs a decision.`);
    setHasUnsavedChanges(false);
  };

  const handleCloseReview = (courtId: number) => {
    if (hasUnsavedChanges && discardConfirmId !== courtId) {
      setDiscardConfirmId(courtId);
      return;
    }
    void toggleReview(courtId);
  };

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setHasUnsavedChanges(dirty);
    if (dirty) setDiscardConfirmId(null);
  }, []);

  return (
    <section className="admin-court-queue" aria-labelledby="pending-courts-title">
      <div className="admin-section-header admin-section-header--court">
        <div>
          <span className="admin-section-eyebrow">Not live yet</span>
          <h3 id="pending-courts-title">Unpublished court drafts</h3>
          <p>Players submitted these new courts. Review a draft, make any corrections, then publish that exact version.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="admin-refresh-btn">
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          Refresh
        </button>
      </div>

      {error && <div className="admin-courts-alert admin-courts-alert--error" role="alert">{error}</div>}
      {notice && <div className="admin-courts-alert admin-courts-alert--success" role="status">{notice}</div>}

      {loading && courts.length === 0 ? (
        <div className="admin-courts-loading"><Loader size={20} className="spinning" /> Loading submissions…</div>
      ) : courts.length === 0 ? (
        <div className="admin-courts-empty">
          <CheckCircle2 size={30} />
          <strong>All new courts are reviewed</strong>
          <span>New player-submitted drafts will appear here before they go live.</span>
        </div>
      ) : (
        <div className="admin-court-review-list">
          {courts.map((court, index) => {
            const isExpanded = expandedId === court.id;
            return (
              <article key={court.id} className={`admin-court-review-item ${isExpanded ? 'is-open' : ''}`}>
                <div className="admin-court-review-summary">
                  <span className="admin-court-review-position" aria-label={`Queue position ${index + 1}`}>{index + 1}</span>
                  <div className="admin-court-review-title">
                    <strong>{court.name || 'Unnamed court'}</strong>
                    <span><MapPin size={13} /> {court.address || 'No address supplied'}</span>
                  </div>
                  <dl className="admin-court-review-facts">
                    <div><dt>Surface</dt><dd>{court.surface_type?.replace(/_/g, ' ') || 'Not set'}</dd></div>
                    <div><dt>Courts</dt><dd>{court.court_count ?? 'Not set'}</dd></div>
                    <div><dt>Submitted</dt><dd><Clock3 size={12} /> {formatDate(court.created_at)}</dd></div>
                  </dl>
                  <button
                    type="button"
                    className="admin-court-review-open"
                    onClick={() => void toggleReview(court.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`pending-court-${court.id}`}
                  >
                    {isExpanded ? 'Close review' : 'Review submission'}
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {isExpanded && (
                  <div id={`pending-court-${court.id}`} className="admin-court-review-detail">
                    {detailLoading && !courtDetail ? (
                      <div className="admin-courts-loading"><Loader size={18} className="spinning" /> Loading full details…</div>
                    ) : (
                      <CourtEditRow
                        court={(courtDetail || court) as AdminCourt}
                        onSave={handleCourtUpdated}
                        onCancel={() => handleCloseReview(court.id)}
                        photos={(courtDetail?.court_photos || []) as CourtPhoto[]}
                        reviews={(courtDetail?.reviews || []) as CourtReview[]}
                        detailLoading={detailLoading}
                        showStatus={false}
                        showActive={false}
                        saveLabel="Save corrections"
                        closeLabel={hasUnsavedChanges ? (discardConfirmId === court.id ? 'Confirm discard' : 'Discard changes') : 'Close'}
                        onDirtyChange={handleDirtyChange}
                        onPublish={(updatedCourt) => handleAction(updatedCourt as PendingCourt, 'approve')}
                        onReject={() => void handleAction(court, 'reject')}
                        actionLoading={actionId === court.id}
                        rejectLabel={rejectConfirmId === court.id ? 'Confirm rejection' : 'Reject draft'}
                      />
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
