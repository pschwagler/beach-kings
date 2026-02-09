'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Check, Loader2, AlertCircle, Expand } from 'lucide-react';
import { Button } from '../ui/UI';
import { usePhotoMatchReview } from './hooks/usePhotoMatchReview';
import PhotoMatchResultsTable from './components/PhotoMatchResultsTable';
import PhotoMatchConversation from './components/PhotoMatchConversation';
import PhotoMatchConfirmationOptions from './components/PhotoMatchConfirmationOptions';

/**
 * Modal for reviewing AI-parsed match results and confirming creation.
 * Uses usePhotoMatchReview hook and subcomponents for results table, conversation, and confirmation.
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
  onSuccess,
}) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const conversationEndRef = useRef(null);

  const {
    status,
    result,
    partialMatches,
    error,
    isSubmitting,
    editPrompt,
    setEditPrompt,
    conversationHistory,
    selectedSeasonId,
    setSelectedSeasonId,
    matchDate,
    setMatchDate,
    handleClose,
    handleSendEdit,
    handleConfirm,
  } = usePhotoMatchReview({
    isOpen,
    initialJobId,
    leagueId,
    sessionId,
    seasonId,
    onClose,
    onSuccess,
  });

  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationHistory]);

  if (!isOpen) {
    return null;
  }

  const isProcessing = status === 'PENDING' || status === 'RUNNING';
  const needsClarification = result?.status === 'needs_clarification';
  const isUnreadable = result?.status === 'unreadable';
  const hasMatches = result?.matches?.length > 0;
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
      {isProcessing && displayMatches.length === 0 && (
        <div className="review-processing">
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
          <p>Analyzing image and extracting scores...</p>
          <p className="processing-hint">This may take a few seconds</p>
        </div>
      )}

      {isUnreadable && (
        <div className="review-unreadable">
          <AlertCircle size={32} />
          <p>Could not read the image</p>
          <p className="unreadable-detail">{result?.error_message}</p>
        </div>
      )}

      {displayMatches.length > 0 && (
        <PhotoMatchResultsTable matches={displayMatches} isProcessing={isProcessing} />
      )}

      <PhotoMatchConversation
        conversationHistory={conversationHistory}
        editPrompt={editPrompt}
        onEditPromptChange={setEditPrompt}
        onSendEdit={handleSendEdit}
        needsClarification={needsClarification}
        clarificationQuestion={result?.clarification_question}
        isProcessing={isProcessing}
        showEditInput={
          (result?.status === 'success' || needsClarification || hasMatches) && status !== 'confirmed'
        }
        isSubmitting={isSubmitting}
        conversationEndRef={conversationEndRef}
      />

      {hasMatches && !isProcessing && status !== 'confirmed' && (
        <PhotoMatchConfirmationOptions
          selectedSeasonId={selectedSeasonId}
          onSelectedSeasonIdChange={setSelectedSeasonId}
          matchDate={matchDate}
          onMatchDateChange={setMatchDate}
          seasons={seasons}
          disabled={isSubmitting}
        />
      )}

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
      <div
        className={`modal-content photo-review-modal${showSideBySide ? ' side-by-side' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
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
              <div className="review-main">{mainContent}</div>
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
                  <span className="review-image-expand-hint">
                    <Expand size={14} /> Click to expand
                  </span>
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
