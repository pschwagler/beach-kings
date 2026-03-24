'use client';

import './PhotoMatchReviewModal.css';
import { useState, useEffect, useRef } from 'react';
import { X, Check, Loader2, AlertCircle, Expand, ImageOff } from 'lucide-react';
import { Button } from '../ui/UI';
import { usePhotoMatchReview, JOB_STATUS } from './hooks/usePhotoMatchReview';
import PhotoMatchResultsTable from './components/PhotoMatchResultsTable';
import PhotoMatchConversation from './components/PhotoMatchConversation';
import PhotoMatchConfirmationOptions from './components/PhotoMatchConfirmationOptions';
import UnrecognizedPlayersSection from './components/UnrecognizedPlayersSection';
import PlayerSearchModal from './components/PlayerSearchModal';

interface PhotoMatchReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueId?: number | null;
  jobId?: number | null;
  sessionId?: number | null;
  seasonId?: number | null;
  seasons?: any[];
  uploadedImageUrl?: string | null;
  onSuccess?: ((...args: any[]) => void) | null;
}

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
}: PhotoMatchReviewModalProps) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const [resolutionTarget, setResolutionTarget] = useState(null);
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
    unmatchedNames,
    handleClose,
    handleSendEdit,
    handleConfirm,
    handleResolvePlayer,
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

  const isProcessing = status === JOB_STATUS.PENDING || status === JOB_STATUS.RUNNING;
  const needsClarification = result?.status === 'needs_clarification';
  const isUnreadable = result?.status === 'unreadable';
  const hasMatches = result?.matches?.length > 0;
  const hasUnmatchedPlayers = unmatchedNames.length > 0;
  const noMatchesFound = !isProcessing && result && !isUnreadable && !hasMatches && status !== JOB_STATUS.CONFIRMED;
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

      {noMatchesFound && (
        <div className="review-no-matches">
          <ImageOff size={32} />
          <p>No games extracted from this image</p>
          {result?.note && (
            <p className="no-matches-detail">{result.note}</p>
          )}
        </div>
      )}

      {displayMatches.length > 0 && (
        <PhotoMatchResultsTable matches={displayMatches} isProcessing={isProcessing} />
      )}

      {hasMatches && !isProcessing && hasUnmatchedPlayers && (
        <UnrecognizedPlayersSection
          unmatchedNames={unmatchedNames as string[]}
          onResolve={(name) => setResolutionTarget({ rawName: name })}
        />
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
          (result?.status === 'success' || needsClarification || hasMatches) && status !== JOB_STATUS.CONFIRMED
        }
        isSubmitting={isSubmitting}
        conversationEndRef={conversationEndRef}
      />

      {hasMatches && !isProcessing && status !== JOB_STATUS.CONFIRMED && (
        <PhotoMatchConfirmationOptions
          selectedSeasonId={selectedSeasonId}
          onSelectedSeasonIdChange={setSelectedSeasonId}
          matchDate={matchDate}
          onMatchDateChange={setMatchDate}
          seasons={seasons}
          disabled={isSubmitting}
        />
      )}

      {status === JOB_STATUS.CONFIRMED && (
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
            {status === JOB_STATUS.CONFIRMED ? 'Close' : 'Cancel'}
          </Button>
          {hasMatches && !isProcessing && status !== JOB_STATUS.CONFIRMED && (
            <Button
              variant="success"
              onClick={handleConfirm}
              disabled={isSubmitting || needsClarification || hasUnmatchedPlayers}
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

      <PlayerSearchModal
        isOpen={!!resolutionTarget}
        rawName={resolutionTarget?.rawName || ''}
        leagueId={leagueId}
        onSelect={(playerId, playerName) => {
          if (resolutionTarget) {
            handleResolvePlayer(resolutionTarget.rawName, playerId, playerName);
          }
          setResolutionTarget(null);
        }}
        onClose={() => setResolutionTarget(null)}
      />

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

    </div>
  );
}
