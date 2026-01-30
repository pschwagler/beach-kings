'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, Edit3, Loader2, AlertCircle, MessageSquare, Send, RefreshCw, Expand } from 'lucide-react';
import { Button } from '../ui/UI';
import {
  editPhotoResults,
  confirmPhotoMatches,
  cancelPhotoSession,
  subscribePhotoJobStream
} from '../../services/api';

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
  uploadedImageUrl = null,
  onSuccess
}) {
  const [jobId, setJobId] = useState(initialJobId);
  const [status, setStatus] = useState('PENDING');
  const [result, setResult] = useState(null);
  const [partialMatches, setPartialMatches] = useState(null); // streamed matches while job is running
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [conversationHistory, setConversationHistory] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(seasonId);
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [imageExpanded, setImageExpanded] = useState(false);

  const streamAbortRef = useRef(null);
  const conversationEndRef = useRef(null);

  // Scroll conversation to bottom when new messages arrive
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationHistory]);

  // Subscribe to photo job stream when modal is open and we have a jobId
  useEffect(() => {
    if (!isOpen || !jobId || !leagueId || status === 'COMPLETED' || status === 'FAILED') {
      return;
    }
    streamAbortRef.current = subscribePhotoJobStream(leagueId, jobId, {
      onPartial: (data) => {
        if (data.partial_matches != null) {
          setPartialMatches(data.partial_matches);
        }
      },
      onDone: (data) => {
        setPartialMatches(null);
        setStatus(data.status || 'COMPLETED');
        if (data.status === 'COMPLETED' && data.result) {
          setResult(data.result);
          if (data.result.clarification_question) {
            setConversationHistory(prev => [
              ...prev,
              {
                role: 'assistant',
                content: data.result.clarification_question,
                timestamp: new Date().toISOString()
              }
            ]);
          }
        } else if (data.status === 'FAILED') {
          setError(data.result?.error_message || 'Processing failed');
        }
      },
      onError: (data) => {
        setPartialMatches(null);
        setError(data.message || 'Stream error');
      }
    });
    return () => {
      if (streamAbortRef.current) {
        streamAbortRef.current();
        streamAbortRef.current = null;
      }
    };
  }, [isOpen, jobId, leagueId, status]);

  // Reset state when modal is opened with a NEW initialJobId (not when jobId changes internally from edits)
  const prevInitialJobIdRef = useRef(initialJobId);
  useEffect(() => {
    // Only reset if the PROP changed (modal opened with different job), not internal changes
    if (initialJobId !== prevInitialJobIdRef.current) {
      prevInitialJobIdRef.current = initialJobId;
      setJobId(initialJobId);
      setStatus('PENDING');
      setResult(null);
      setError(null);
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

    if (streamAbortRef.current) {
      streamAbortRef.current();
      streamAbortRef.current = null;
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
      
      // Update job ID; SSE effect will open a new stream for the new job
      setJobId(response.job_id);
      setStatus('PENDING');
      setResult(null);
      setEditPrompt('');
      if (streamAbortRef.current) {
        streamAbortRef.current();
        streamAbortRef.current = null;
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
      setError(err.response?.data?.detail || 'Failed to create games');
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

  const isProcessing = status === 'PENDING' || status === 'RUNNING';
  const needsClarification = result?.status === 'needs_clarification';
  const isSuccess = result?.status === 'success';
  const isUnreadable = result?.status === 'unreadable';
  const hasMatches = result?.matches?.length > 0;
  // Show table with final result or streamed partial matches
  const displayMatches = result?.matches ?? partialMatches ?? [];
  const showSideBySide = Boolean(uploadedImageUrl && displayMatches.length > 0);

  const imagePanel = uploadedImageUrl && (
    <div
      className="review-image-panel"
      onClick={() => setImageExpanded(true)}
      role="button"
      tabIndex={0}
      aria-label="Click to expand image"
      onKeyDown={(e) => e.key === 'Enter' && setImageExpanded(true)}
    >
      <img src={uploadedImageUrl} alt="Uploaded scoreboard" />
    </div>
  );

  const mainContent = (
    <>
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
              Extracting games...
            </p>
          )}
          <h3>Extracted Games ({displayMatches.length})</h3>
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
                      // Priority: _matched field (from backend) > object.name > string > placeholder
                      const getPlayerName = (fieldName) => {
                        const matchedName = match[`${fieldName}_matched`];
                        if (matchedName) return matchedName;
                        
                        const player = match[fieldName];
                        if (!player) return isProcessing ? '…' : 'Unknown';
                        if (typeof player === 'string') return player || (isProcessing ? '…' : 'Unknown');
                        if (typeof player === 'object' && player.name) return player.name;
                        return isProcessing ? '…' : 'Unknown';
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
              <p>Games created successfully!</p>
            </div>
          )}
    </>
  );

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className={`modal-content photo-review-modal${showSideBySide ? ' side-by-side' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Review Extracted Games</h2>
          <Button variant="close" onClick={handleClose} disabled={isSubmitting}>
            <X size={20} />
          </Button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="review-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {showSideBySide ? (
            <div className="review-body-side-by-side">
              {imagePanel}
              <div className="review-main">
                {mainContent}
              </div>
            </div>
          ) : (
            <>
              {uploadedImageUrl && (
                <div
                  className="uploaded-image-preview stacked"
                  onClick={() => setImageExpanded(true)}
                  role="button"
                  tabIndex={0}
                  aria-label="Click to expand image"
                  onKeyDown={(e) => e.key === 'Enter' && setImageExpanded(true)}
                >
                  <img src={uploadedImageUrl} alt="Uploaded scoreboard" />
                  <span className="review-image-expand-hint"><Expand size={14} /> Click to expand</span>
                </div>
              )}
              {mainContent}
            </>
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
                  Confirm & Create {result.matches.length} Games
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Full-screen overlay when user clicks image to expand */}
      {imageExpanded && uploadedImageUrl && (
        <div
          className="image-expand-overlay"
          onClick={() => setImageExpanded(false)}
          role="button"
          tabIndex={0}
          aria-label="Close expanded image"
          onKeyDown={(e) => e.key === 'Escape' && setImageExpanded(false)}
        >
          <div className="image-expand-inner" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="close"
              className="image-expand-close"
              onClick={() => setImageExpanded(false)}
              aria-label="Close"
            >
              <X size={24} />
            </Button>
            <img src={uploadedImageUrl} alt="Uploaded scoreboard (full size)" />
          </div>
        </div>
      )}

      <style jsx global>{`
        .photo-review-modal .modal-header h2 {
          font-size: 1.1rem;
          font-weight: 600;
        }

        .photo-review-modal {
          max-width: 700px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .photo-review-modal.side-by-side {
          max-width: 1000px;
        }

        .photo-review-modal .modal-body {
          overflow-y: auto;
          flex: 1;
        }

        .photo-review-modal .review-body-side-by-side {
          display: flex;
          flex-direction: row;
          gap: 24px;
          align-items: flex-start;
        }

        .photo-review-modal .review-image-panel {
          flex-shrink: 0;
          cursor: pointer;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border-color, #e5e7eb);
          background: var(--bg-muted, #f9fafb);
          /* Align top with matches table: table is under h3 in review-results */
          margin-top: 28px;
        }

        .photo-review-modal .review-image-panel img {
          display: block;
          max-height: min(400px, 60vh);
          max-width: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
        }

        .photo-review-modal .review-image-expand-hint {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 8px;
          font-size: 12px;
          color: var(--text-muted, #6b7280);
          background: var(--bg-secondary, #f9fafb);
        }

        .photo-review-modal .review-main {
          flex: 1;
          min-width: 0;
        }

        @media (max-width: 768px) {
          .photo-review-modal.side-by-side {
            max-width: 100%;
          }
          .photo-review-modal .review-body-side-by-side {
            flex-direction: column;
          }
          .photo-review-modal .review-image-panel {
            margin-top: 0;
          }
          .photo-review-modal .review-image-panel img {
            max-height: min(280px, 50vh);
          }
        }

        .photo-review-modal .uploaded-image-preview {
          margin-bottom: 16px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border-color, #e5e7eb);
          background: var(--bg-muted, #f9fafb);
          display: inline-block;
          cursor: pointer;
        }

        .photo-review-modal .uploaded-image-preview.stacked img {
          display: block;
          max-height: 200px;
          max-width: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
        }

        .photo-review-modal .uploaded-image-preview.stacked .review-image-expand-hint {
          display: flex;
        }

        .photo-review-modal .uploaded-image-preview img {
          display: block;
          max-height: 140px;
          max-width: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
        }

        .photo-review-modal .review-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: var(--error-bg, #fef2f2);
          color: var(--error-text, #dc2626);
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 13px;
        }

        .photo-review-modal .review-processing {
          text-align: center;
          padding: 40px 20px;
        }

        .photo-review-modal .review-processing p {
          margin: 12px 0 0 0;
          color: var(--text-primary, #374151);
          font-size: 13px;
        }

        .photo-review-modal .review-processing .processing-hint {
          font-size: 12px;
          color: var(--text-muted, #9ca3af);
        }

        .photo-review-modal .spinner {
          animation: photo-review-spin 1s linear infinite;
        }

        @keyframes photo-review-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .photo-review-modal .review-unreadable {
          text-align: center;
          padding: 40px 20px;
          color: var(--error-text, #dc2626);
        }

        .photo-review-modal .review-unreadable p {
          margin: 12px 0 0 0;
          font-size: 13px;
        }

        .photo-review-modal .unreadable-detail {
          font-size: 13px;
          color: var(--text-muted, #6b7280);
        }

        .photo-review-modal .review-results h3 {
          font-size: 13px;
          margin: 0 0 10px 0;
          color: var(--text-primary, #374151);
        }

        .photo-review-modal .matches-table-container {
          overflow-x: auto;
        }

        .photo-review-modal .matches-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .photo-review-modal .matches-table th,
        .photo-review-modal .matches-table td {
          padding: 8px 10px;
          text-align: left;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .photo-review-modal .matches-table th {
          background: var(--bg-secondary, #f9fafb);
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          font-size: 11px;
          text-transform: uppercase;
        }

        .photo-review-modal .match-num {
          color: var(--text-muted, #9ca3af);
          font-weight: 500;
          width: 36px;
        }

        .photo-review-modal .score {
          font-weight: 600;
          text-align: center;
          width: 52px;
        }

        .photo-review-modal .score-unclear {
          color: var(--warning-text, #d97706);
          font-style: italic;
        }

        .photo-review-modal .player-names {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .photo-review-modal .player-unmatched {
          color: var(--warning-text, #d97706);
          font-style: italic;
        }

        .photo-review-modal .unmatched {
          background: var(--warning-bg, #fffbeb);
        }

        .photo-review-modal .clarification-needed {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 12px;
          background: var(--info-bg, #eff6ff);
          border-radius: 8px;
          margin-top: 16px;
          font-size: 13px;
          color: var(--info-text, #1e40af);
        }

        .photo-review-modal .clarification-needed svg {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .photo-review-modal .conversation-section {
          margin-top: 16px;
        }

        .photo-review-modal .conversation-section h4 {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          margin: 0 0 8px 0;
          color: var(--text-secondary, #6b7280);
        }

        .photo-review-modal .conversation-messages {
          max-height: 150px;
          overflow-y: auto;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          padding: 12px;
          background: var(--bg-secondary, #f9fafb);
        }

        .photo-review-modal .message {
          margin-bottom: 8px;
          font-size: 13px;
        }

        .photo-review-modal .message:last-child {
          margin-bottom: 0;
        }

        .photo-review-modal .message.user {
          color: var(--text-primary, #374151);
        }

        .photo-review-modal .message.assistant {
          color: var(--info-text, #1e40af);
        }

        .photo-review-modal .message-role {
          font-weight: 600;
          margin-right: 6px;
        }

        .photo-review-modal .edit-prompt-section {
          margin-top: 16px;
        }

        .photo-review-modal .edit-prompt-section label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary, #374151);
          margin-bottom: 6px;
        }

        .photo-review-modal .edit-input-row {
          display: flex;
          gap: 8px;
        }

        .photo-review-modal .edit-input-row textarea {
          flex: 1;
          padding: 8px 10px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          font-size: 13px;
          resize: none;
          font-family: inherit;
        }

        .photo-review-modal .edit-input-row textarea:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
        }

        .photo-review-modal .edit-input-row button {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .photo-review-modal .confirmation-options {
          display: flex;
          gap: 16px;
          margin-top: 16px;
        }

        .photo-review-modal .option-row {
          flex: 1;
        }

        .photo-review-modal .option-row label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary, #374151);
          margin-bottom: 6px;
        }

        .photo-review-modal .option-row select,
        .photo-review-modal .option-row input {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          font-size: 13px;
          font-family: inherit;
        }

        .photo-review-modal .option-row select:focus,
        .photo-review-modal .option-row input:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
        }

        .photo-review-modal .review-success {
          text-align: center;
          padding: 40px 20px;
          color: var(--success-text, #16a34a);
        }

        .photo-review-modal .review-success p {
          margin: 12px 0 0 0;
          font-size: 14px;
          font-weight: 500;
        }

        .photo-review-modal .modal-actions button {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .image-expand-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }

        .image-expand-inner {
          position: relative;
          max-width: 98vw;
          max-height: 98vh;
        }

        .image-expand-inner img {
          display: block;
          max-width: 98vw;
          max-height: 98vh;
          width: auto;
          height: auto;
          object-fit: contain;
          image-rendering: auto;
        }

        .image-expand-close {
          position: absolute;
          top: -44px;
          right: 0;
          background: rgba(255, 255, 255, 0.9);
          color: #374151;
        }

        .image-expand-close:hover {
          background: #fff;
        }
      `}</style>
    </div>
  );
}
