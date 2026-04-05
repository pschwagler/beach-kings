import { Suspense, lazy } from 'react';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import '../modal/Modal.css';
import ErrorBoundary from './ErrorBoundary';

const CreateLeagueModal = lazy(() => import('../league/CreateLeagueModal'));
const PlayerProfileModal = lazy(() => import('../player/PlayerProfileModal'));
const AddMatchModal = lazy(() => import('../match/AddMatchModal'));
const EditWeeklyScheduleModal = lazy(() => import('../league/EditWeeklyScheduleModal'));
const SignupModal = lazy(() => import('../league/SignupModal'));
const ConfirmationModal = lazy(() => import('../modal/ConfirmationModal'));
const SessionSummaryModal = lazy(() => import('../modal/SessionSummaryModal'));
const FeedbackModal = lazy(() => import('../FeedbackModal'));
const UploadPhotoModal = lazy(() => import('../match/UploadPhotoModal'));
const PhotoMatchReviewModal = lazy(() => import('../match/PhotoMatchReviewModal'));
const CreateGameModal = lazy(() => import('../game/CreateGameModal'));
const ShareFallbackModal = lazy(() => import('./ShareFallbackModal'));

const MODAL_COMPONENTS = {
  [MODAL_TYPES.CREATE_LEAGUE]: CreateLeagueModal,
  [MODAL_TYPES.PLAYER_PROFILE]: PlayerProfileModal,
  [MODAL_TYPES.ADD_MATCH]: AddMatchModal,
  [MODAL_TYPES.EDIT_SCHEDULE]: EditWeeklyScheduleModal,
  [MODAL_TYPES.SIGNUP]: SignupModal,
  [MODAL_TYPES.CONFIRMATION]: ConfirmationModal,
  [MODAL_TYPES.SESSION_SUMMARY]: SessionSummaryModal,
  [MODAL_TYPES.UPLOAD_PHOTO]: UploadPhotoModal,
  [MODAL_TYPES.REVIEW_PHOTO_MATCHES]: PhotoMatchReviewModal,
  [MODAL_TYPES.CREATE_GAME]: CreateGameModal,
  [MODAL_TYPES.SHARE_FALLBACK]: ShareFallbackModal,
  [MODAL_TYPES.FEEDBACK]: FeedbackModal,
};

export default function GlobalModal() {
  const { isOpen, modalType, modalProps, closeModal } = useModal();

  if (!isOpen || !modalType) {
    return null;
  }

  const ModalComponent = MODAL_COMPONENTS[modalType];

  if (!ModalComponent) {
    console.warn('[GlobalModal] No modal component found for type:', modalType);
    return null;
  }

  // Key on initialJobId so PhotoMatchReviewModal remounts (resetting hook state)
  // when a new job starts. Falls back to modalType for other modals.
  const modalKey = (modalProps?.initialJobId as string | number | undefined) ?? modalType;

  return (
    <ErrorBoundary onReset={closeModal}>
      <Suspense fallback={null}>
        <ModalComponent
          key={modalKey}
          isOpen={isOpen}
          onClose={closeModal}
          {...(modalProps as any)}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
