'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, Edit3, Loader2, AlertCircle, MessageSquare, Send, RefreshCw } from 'lucide-react';
import { Button } from '../ui/UI';
import {
  getPhotoJobStatus,
  editPhotoResults,
  confirmPhotoMatches,
  cancelPhotoSession
} from '../../services/api';

const POLL_INTERVAL = 1500; // 1.5 seconds
const MAX_POLL_ATTEMPTS = 120; // 3 minutes max

/**
 * Modal for reviewing AI-parsed match results and confirming creation
 */
export default function PhotoMatchReviewModal({
  isOpen,
  onClose,
  leagueId,
  jobId: initialJobId,
  sessionId,
  seasonId,
  seasons = [],
  onSuccess
}) {
  const [jobId, setJobId] = useState(initialJobId);
  const [status, setStatus] = useState('pending');
  const [result, setResult] = useState(null);
  const [partialMatches, setPartialMatches] = useState(null); // streamed matches while job is running
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [conversationHistory, setConversationHistory] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(seasonId);
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [pollAttempts, setPollAttempts] = useState(0);
  
  const pollIntervalRef = useRef(null);
  const conversationEndRef = useRef(null);
  const isPollingRef = useRef(false);

  // Scroll conversation to bottom when new messages arrive
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationHistory]);

  // Poll for job status
  const pollJobStatus = useCallback(async () => {
    if (!jobId || !leagueId || isPollingRef.current) return;
    
    isPollingRef.current = true;

    try {
      const jobStatus = await getPhotoJobStatus(leagueId, jobId);
      
      setStatus(jobStatus.status);
      
      // While running, show streamed partial_matches in the table
      if (jobStatus.status === 'running' && jobStatus.partial_matches?.length > 0) {
        setPartialMatches(jobStatus.partial_matches);
      }
      
      if (jobStatus.status === 'completed' && jobStatus.result) {
        console.log('[PhotoMatchReviewModal] Job completed, matches:', jobStatus.result.matches?.length);
        setPartialMatches(null);
        setResult(jobStatus.result);
        
        // Add AI response to conversation
        if (jobStatus.result.clarification_question) {
          setConversationHistory(prev => [
            ...prev,
            {
              role: 'assistant',
              content: jobStatus.result.clarification_question,
              timestamp: new Date().toISOString()
            }
          ]);
        }
        
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else if (jobStatus.status === 'failed') {
        console.log('[PhotoMatchReviewModal] Job failed:', jobStatus.result?.error_message);
        setPartialMatches(null);
        setError(jobStatus.result?.error_message || 'Processing failed');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
      
      setPollAttempts(prev => prev + 1);
    } catch (err) {
      console.error('[PhotoMatchReviewModal] Error polling job status:', err);
      // Only set error for non-429 errors (rate limiting)
      if (err.response?.status !== 429) {
        setError('Failed to check processing status');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [jobId, leagueId]);

  // Start polling when modal opens
  useEffect(() => {
    // Only start polling if modal is open, we have a jobId, and we're not already done
    if (!isOpen || !jobId || status === 'completed' || status === 'failed') {
      return;
    }
    
    // Don't start a new interval if one is already running
    if (pollIntervalRef.current) {
      return;
    }
    
    console.log('[PhotoMatchReviewModal] Starting polling for job:', jobId);
    
    // Initial poll
    pollJobStatus();
    
    // Set up interval - use a ref to track poll count inside the interval
    let localPollCount = pollAttempts;
    pollIntervalRef.current = setInterval(() => {
      localPollCount++;
      if (localPollCount >= MAX_POLL_ATTEMPTS) {
        setError('Processing timed out. Please try again.');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return;
      }
      pollJobStatus();
    }, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        console.log('[PhotoMatchReviewModal] Cleaning up polling interval');
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isOpen, jobId, status]); // Removed pollJobStatus and pollAttempts from deps to prevent re-triggering

  // Reset state when modal is opened with a NEW initialJobId (not when jobId changes internally from edits)
  const prevInitialJobIdRef = useRef(initialJobId);
  useEffect(() => {
    // Only reset if the PROP changed (modal opened with different job), not internal changes
    if (initialJobId !== prevInitialJobIdRef.current) {
      console.log('[PhotoMatchReviewModal] initialJobId prop changed from', prevInitialJobIdRef.current, 'to', initialJobId);
      prevInitialJobIdRef.current = initialJobId;
      setJobId(initialJobId);
      setStatus('pending');
      setResult(null);
      setError(null);
      setPollAttempts(0);
      setConversationHistory([]);
      setPartialMatches(null);
    }
  }, [initialJobId]);

  const handleClose = useCallback(async () => {
    if (isSubmitting) return;

    // Cancel the session if not confirmed
    if (sessionId && status !== 'confirmed') {
      try {
        await cancelPhotoSession(leagueId, sessionId);
      } catch (err) {
        console.error('[PhotoMatchReviewModal] Error cancelling session:', err);
      }
    }

    // Clear interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    onClose();
  }, [isSubmitting, sessionId, status, leagueId, onClose]);

  const handleSendEdit = useCallback(async () => {
    if (!editPrompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    // Add user message to conversation
    setConversationHistory(prev => [
      ...prev,
      {
        role: 'user',
        content: editPrompt.trim(),
        timestamp: new Date().toISOString()
      }
    ]);

    try {
      const response = await editPhotoResults(leagueId, sessionId, editPrompt.trim());
      
      // Update job ID and reset polling for the new job
      console.log('[PhotoMatchReviewModal] Edit submitted, new job_id:', response.job_id);
      setJobId(response.job_id);
      setStatus('pending');
      setResult(null);
      setPollAttempts(0);
      setEditPrompt('');
      
      // Clear the existing polling interval so the useEffect can restart it for the new job
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
    } catch (err) {
      console.error('Error sending edit:', err);
      setError(err.response?.data?.detail || 'Failed to send edit');
    } finally {
      setIsSubmitting(false);
    }
  }, [editPrompt, isSubmitting, leagueId, sessionId]);

  const handleConfirm = useCallback(async () => {
    if (isSubmitting || !result?.matches?.length) return;

    // Validate season and date
    if (!selectedSeasonId) {
      setError('Please select a season');
      return;
    }
    if (!matchDate) {
      setError('Please select a match date');
      return;
    }

    // Check if all players are matched - handles both object {id, name} and separate _id fields
    const isPlayerMatched = (player, playerId) => {
      if (typeof player === 'object' && player?.id) return true;
      if (playerId) return true;
      return false;
    };
    
    const unmatchedPlayers = result.matches.some(match => 
      !isPlayerMatched(match.team1_player1, match.team1_player1_id) ||
      !isPlayerMatched(match.team1_player2, match.team1_player2_id) ||
      !isPlayerMatched(match.team2_player1, match.team2_player1_id) ||
      !isPlayerMatched(match.team2_player2, match.team2_player2_id)
    );

    if (unmatchedPlayers) {
      setError('Some players could not be matched. Please use the edit prompt to clarify player names.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await confirmPhotoMatches(leagueId, sessionId, selectedSeasonId, matchDate);
      
      setStatus('confirmed');
      onSuccess(response.match_ids);
      
    } catch (err) {
      console.error('Error confirming matches:', err);
      setError(err.response?.data?.detail || 'Failed to create matches');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, result, selectedSeasonId, matchDate, leagueId, sessionId, onSuccess]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendEdit();
    }
  }, [handleSendEdit]);

  if (!isOpen) {
    return null;
  }

  const isProcessing = status === 'pending' || status === 'running';
  const needsClarification = result?.status === 'needs_clarification';
  const isSuccess = result?.status === 'success';
  const isUnreadable = result?.status === 'unreadable';
  const hasMatches = result?.matches?.length > 0;
  // Show table with final result or streamed partial matches
  const displayMatches = result?.matches ?? partialMatches ?? [];

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content photo-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Review Extracted Matches</h2>
          <Button variant="close" onClick={handleClose} disabled={isSubmitting}>
            <X size={20} />
          </Button>
        </div>

        <div className="modal-body">
          {/* Error Display */}
          {error && (
            <div className="review-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Processing State - show full block only when no partial matches yet */}
          {isProcessing && displayMatches.length === 0 && (
            <div className="review-processing">
              <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
              <p>Analyzing image and extracting scores...</p>
              <p className="processing-hint">This may take a few seconds</p>
            </div>
          )}

          {/* Unreadable State */}
          {isUnreadable && (
            <div className="review-unreadable">
              <AlertCircle size={32} />
              <p>Could not read the image</p>
              <p className="unreadable-detail">{result?.error_message}</p>
            </div>
          )}

          {/* Results Table - show while streaming (partialMatches) or when completed */}
          {displayMatches.length > 0 && (
            <div className="review-results">
              {isProcessing && (
                <p className="processing-hint" style={{ marginBottom: '8px' }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '6px' }} />
                  Extracting matches...
                </p>
              )}
              <h3>Extracted Matches ({displayMatches.length})</h3>
              <div className="matches-table-container">
                <table className="matches-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Team 1</th>
                      <th>Score</th>
                      <th>Team 2</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMatches.map((match, idx) => {
                      // Helper to get player display name
                      // Priority: _matched field (from backend) > object.name > string > Unknown
                      const getPlayerName = (fieldName) => {
                        const matchedName = match[`${fieldName}_matched`];
                        if (matchedName) return matchedName;
                        
                        const player = match[fieldName];
                        if (!player) return 'Unknown';
                        if (typeof player === 'string') return player;
                        if (typeof player === 'object' && player.name) return player.name;
                        return 'Unknown';
                      };
                      
                      // Check if player is matched (has an id)
                      const isMatched = (fieldName) => {
                        // Check for _id field first (from backend matching)
                        if (match[`${fieldName}_id`]) return true;
                        const player = match[fieldName];
                        if (!player) return false;
                        if (typeof player === 'object' && player.id) return true;
                        return false;
                      };
                      
                      return (
                        <tr key={idx}>
                          <td className="match-num">{idx + 1}</td>
                          <td className={!isMatched('team1_player1') || !isMatched('team1_player2') ? 'unmatched' : ''}>
                            <div className="player-names">
                              <span className={!isMatched('team1_player1') ? 'player-unmatched' : ''}>
                                {getPlayerName('team1_player1')}
                              </span>
                              <span className={!isMatched('team1_player2') ? 'player-unmatched' : ''}>
                                {getPlayerName('team1_player2')}
                              </span>
                            </div>
                          </td>
                          <td className={`score ${match.team1_score == null ? 'score-unclear' : ''}`}>
                            {match.team1_score ?? '?'}
                          </td>
                          <td className={!isMatched('team2_player1') || !isMatched('team2_player2') ? 'unmatched' : ''}>
                            <div className="player-names">
                              <span className={!isMatched('team2_player1') ? 'player-unmatched' : ''}>
                                {getPlayerName('team2_player1')}
                              </span>
                              <span className={!isMatched('team2_player2') ? 'player-unmatched' : ''}>
                                {getPlayerName('team2_player2')}
                              </span>
                            </div>
                          </td>
                          <td className={`score ${match.team2_score == null ? 'score-unclear' : ''}`}>
                            {match.team2_score ?? '?'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Conversation History */}
          {conversationHistory.length > 0 && (
            <div className="conversation-section">
              <h4><MessageSquare size={16} /> Conversation</h4>
              <div className="conversation-messages">
                {conversationHistory.map((msg, idx) => (
                  <div key={idx} className={`message ${msg.role}`}>
                    <span className="message-role">{msg.role === 'user' ? 'You' : 'AI'}:</span>
                    <span className="message-content">{msg.content}</span>
                  </div>
                ))}
                <div ref={conversationEndRef} />
              </div>
            </div>
          )}

          {/* Clarification Needed */}
          {needsClarification && result?.clarification_question && conversationHistory.length === 0 && (
            <div className="clarification-needed">
              <MessageSquare size={16} />
              <span>{result.clarification_question}</span>
            </div>
          )}

          {/* Edit Prompt Input */}
          {!isProcessing && (isSuccess || needsClarification || hasMatches) && status !== 'confirmed' && (
            <div className="edit-prompt-section">
              <label>Edit or Clarify</label>
              <div className="edit-input-row">
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="E.g., 'The second game should be 21-18, not 21-19' or 'JD is John Doe'"
                  rows={2}
                  disabled={isSubmitting}
                />
                <Button
                  variant="secondary"
                  onClick={handleSendEdit}
                  disabled={!editPrompt.trim() || isSubmitting}
                >
                  <Send size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* Season & Date Selection */}
          {hasMatches && !isProcessing && status !== 'confirmed' && (
            <div className="confirmation-options">
              <div className="option-row">
                <label>Season</label>
                <select
                  value={selectedSeasonId || ''}
                  onChange={(e) => setSelectedSeasonId(e.target.value ? parseInt(e.target.value) : null)}
                  disabled={isSubmitting}
                >
                  <option value="">Select season...</option>
                  {seasons.map(season => (
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
                  onChange={(e) => setMatchDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          {/* Success Message */}
          {status === 'confirmed' && (
            <div className="review-success">
              <Check size={32} />
              <p>Matches created successfully!</p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <Button onClick={handleClose} disabled={isSubmitting}>
            {status === 'confirmed' ? 'Close' : 'Cancel'}
          </Button>
          {hasMatches && !isProcessing && status !== 'confirmed' && (
            <Button
              variant="success"
              onClick={handleConfirm}
              disabled={isSubmitting || needsClarification}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Creating...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Confirm & Create {result.matches.length} Matches
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <style jsx>{`
        .photo-review-modal {
          max-width: 700px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .photo-review-modal .modal-body {
          overflow-y: auto;
          flex: 1;
        }

        .review-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: var(--error-bg, #fef2f2);
          color: var(--error-text, #dc2626);
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .review-processing {
          text-align: center;
          padding: 40px 20px;
        }

        .review-processing p {
          margin: 12px 0 0 0;
          color: var(--text-primary, #374151);
        }

        .review-processing .processing-hint {
          font-size: 13px;
          color: var(--text-muted, #9ca3af);
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .review-unreadable {
          text-align: center;
          padding: 40px 20px;
          color: var(--error-text, #dc2626);
        }

        .review-unreadable p {
          margin: 12px 0 0 0;
        }

        .unreadable-detail {
          font-size: 14px;
          color: var(--text-muted, #6b7280);
        }

        .review-results h3 {
          font-size: 16px;
          margin: 0 0 12px 0;
          color: var(--text-primary, #374151);
        }

        .matches-table-container {
          overflow-x: auto;
        }

        .matches-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .matches-table th,
        .matches-table td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .matches-table th {
          background: var(--bg-secondary, #f9fafb);
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          font-size: 12px;
          text-transform: uppercase;
        }

        .match-num {
          color: var(--text-muted, #9ca3af);
          font-weight: 500;
          width: 40px;
        }

        .score {
          font-weight: 600;
          text-align: center;
          width: 60px;
        }

        .score-unclear {
          color: var(--warning-text, #d97706);
          font-style: italic;
        }

        .player-names {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .player-unmatched {
          color: var(--warning-text, #d97706);
          font-style: italic;
        }

        .unmatched {
          background: var(--warning-bg, #fffbeb);
        }

        .clarification-needed {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 12px;
          background: var(--info-bg, #eff6ff);
          border-radius: 8px;
          margin-top: 16px;
          font-size: 14px;
          color: var(--info-text, #1e40af);
        }

        .clarification-needed svg {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .conversation-section {
          margin-top: 16px;
        }

        .conversation-section h4 {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          margin: 0 0 8px 0;
          color: var(--text-secondary, #6b7280);
        }

        .conversation-messages {
          max-height: 150px;
          overflow-y: auto;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          padding: 12px;
          background: var(--bg-secondary, #f9fafb);
        }

        .message {
          margin-bottom: 8px;
          font-size: 14px;
        }

        .message:last-child {
          margin-bottom: 0;
        }

        .message.user {
          color: var(--text-primary, #374151);
        }

        .message.assistant {
          color: var(--info-text, #1e40af);
        }

        .message-role {
          font-weight: 600;
          margin-right: 6px;
        }

        .edit-prompt-section {
          margin-top: 16px;
        }

        .edit-prompt-section label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #374151);
          margin-bottom: 6px;
        }

        .edit-input-row {
          display: flex;
          gap: 8px;
        }

        .edit-input-row textarea {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          font-size: 14px;
          resize: none;
          font-family: inherit;
        }

        .edit-input-row textarea:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
        }

        .edit-input-row button {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .confirmation-options {
          display: flex;
          gap: 16px;
          margin-top: 16px;
        }

        .option-row {
          flex: 1;
        }

        .option-row label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #374151);
          margin-bottom: 6px;
        }

        .option-row select,
        .option-row input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
        }

        .option-row select:focus,
        .option-row input:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
        }

        .review-success {
          text-align: center;
          padding: 40px 20px;
          color: var(--success-text, #16a34a);
        }

        .review-success p {
          margin: 12px 0 0 0;
          font-size: 16px;
          font-weight: 500;
        }

        .modal-actions button {
          display: flex;
          align-items: center;
          gap: 6px;
        }
      `}</style>
    </div>
  );
}
