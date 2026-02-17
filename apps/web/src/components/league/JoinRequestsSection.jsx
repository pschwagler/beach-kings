import { useState } from 'react';
import { UserPlus, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { formatRelativeTime } from '../../utils/dateUtils';
import { approveLeagueJoinRequest, rejectLeagueJoinRequest } from '../../services/api';
import ConfirmationModal from '../modal/ConfirmationModal';

/**
 * Displays pending and declined league join requests for admins.
 * Shows empty state when no pending requests; expandable "declined" list with option to approve.
 *
 * @param {Object} props
 * @param {Array<{ id: number, player_name: string, created_at: string }>} props.pendingRequests - Pending join requests
 * @param {Array<{ id: number, player_name: string, created_at: string }>} props.rejectedRequests - Declined join requests
 * @param {() => Promise<void>} props.onRequestProcessed - Callback after approve/reject to refresh the list
 */
export default function JoinRequestsSection({
  pendingRequests = [],
  rejectedRequests = [],
  onRequestProcessed
}) {
  const { leagueId, showMessage } = useLeague();
  const [declinedExpanded, setDeclinedExpanded] = useState(false);
  const [pendingDecline, setPendingDecline] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const formatRequestDate = (dateString) => {
    if (!dateString) return '';
    return formatRelativeTime(dateString) || new Date(dateString).toLocaleDateString();
  };

  const handleApprove = async (requestId) => {
    if (processingId != null) return;
    setProcessingId(requestId);
    try {
      await approveLeagueJoinRequest(leagueId, requestId);
      showMessage?.('success', 'Join request approved');
      await onRequestProcessed?.();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to approve request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId) => {
    if (processingId != null) return;
    setProcessingId(requestId);
    try {
      await rejectLeagueJoinRequest(leagueId, requestId);
      showMessage?.('success', 'Join request declined');
      setPendingDecline(null);
      await onRequestProcessed?.();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to decline request');
      setPendingDecline(null);
    } finally {
      setProcessingId(null);
    }
  };

  const hasPending = pendingRequests?.length > 0;
  const hasDeclined = rejectedRequests?.length > 0;
  const showSection = hasPending || hasDeclined;

  if (!showSection) return null;

  return (
    <div className="league-players-section league-join-requests-section">
      <div className="league-section-header">
        <h3 className="league-section-title">
          <UserPlus size={18} />
          Join Requests
          {hasPending && ` (${pendingRequests.length})`}
        </h3>
      </div>

      {hasPending ? (
        <div className="league-players-list">
          {pendingRequests.map((req) => (
            <div key={req.id} className="league-player-row">
              <div className="league-player-info">
                <div className="league-member-left">
                  <span className="league-member-name">
                    {req.player_name || `Player ${req.player_id}`}
                  </span>
                  {req.created_at && (
                    <span className="league-member-joined">
                      Requested {formatRequestDate(req.created_at)}
                    </span>
                  )}
                </div>
              </div>
              <div className="league-player-actions league-join-request-actions">
                <button
                  type="button"
                  className="league-text-button primary"
                  onClick={() => handleApprove(req.id)}
                  title="Accept invite"
                  disabled={processingId != null}
                >
                  <Check size={16} />
                  {processingId === req.id ? 'Accepting…' : 'Accept Invite'}
                </button>
                <button
                  type="button"
                  className="league-text-button danger"
                  onClick={() => setPendingDecline({ requestId: req.id, playerName: req.player_name || `Player ${req.player_id}` })}
                  title="Decline join request"
                  disabled={processingId != null}
                >
                  <X size={16} />
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="league-join-requests-empty">No pending join requests.</p>
      )}

      {hasDeclined && (
        <div className="league-join-requests-declined">
          <button
            type="button"
            className="league-join-requests-declined-toggle"
            onClick={() => setDeclinedExpanded((e) => !e)}
            aria-expanded={declinedExpanded}
          >
            {declinedExpanded ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
            {declinedExpanded
              ? 'Hide declined requests'
              : `Previously declined (${rejectedRequests.length})`}
          </button>
          {declinedExpanded && (
            <div className="league-players-list league-join-requests-declined-list">
              {rejectedRequests.map((req) => (
                <div key={req.id} className="league-player-row">
                  <div className="league-player-info">
                    <div className="league-member-left">
                      <span className="league-member-name">
                        {req.player_name || `Player ${req.player_id}`}
                      </span>
                      {req.created_at && (
                        <span className="league-member-joined">
                          Requested {formatRequestDate(req.created_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="league-player-actions league-join-request-actions">
                    <button
                      type="button"
                      className="league-text-button primary"
                      onClick={() => handleApprove(req.id)}
                      title="Accept invite"
                      disabled={processingId != null}
                    >
                      <Check size={16} />
                      {processingId === req.id ? 'Accepting…' : 'Accept Invite'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(pendingDecline)}
        onClose={() => setPendingDecline(null)}
        onConfirm={async () => {
          if (pendingDecline?.requestId != null) await handleReject(pendingDecline.requestId);
        }}
        title="Decline join request?"
        message={pendingDecline ? `Decline request from ${pendingDecline.playerName}? They can request again later.` : ''}
        confirmText="Decline"
        cancelText="Cancel"
        confirmButtonClass="danger"
      />
    </div>
  );
}
