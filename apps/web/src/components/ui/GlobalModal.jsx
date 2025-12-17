import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import CreateLeagueModal from '../league/CreateLeagueModal';
import PlayerProfileModal from '../player/PlayerProfileModal';
import AddMatchModal from '../match/AddMatchModal';
import EditWeeklyScheduleModal from '../league/EditWeeklyScheduleModal';
import SignupModal from '../league/SignupModal';
import ConfirmationModal from '../modal/ConfirmationModal';
import SessionSummaryModal from '../modal/SessionSummaryModal';
import ErrorBoundary from './ErrorBoundary';

const MODAL_COMPONENTS = {
  [MODAL_TYPES.CREATE_LEAGUE]: CreateLeagueModal,
  [MODAL_TYPES.PLAYER_PROFILE]: PlayerProfileModal,
  [MODAL_TYPES.ADD_MATCH]: AddMatchModal,
  [MODAL_TYPES.EDIT_SCHEDULE]: EditWeeklyScheduleModal,
  [MODAL_TYPES.SIGNUP]: SignupModal,
  [MODAL_TYPES.CONFIRMATION]: ConfirmationModal,
  [MODAL_TYPES.SESSION_SUMMARY]: SessionSummaryModal,
};

export default function GlobalModal() {
  const { isOpen, modalType, modalProps, closeModal } = useModal();

  if (!isOpen || !modalType) return null;

  const ModalComponent = MODAL_COMPONENTS[modalType];

  if (!ModalComponent) {
    console.warn(`No modal component found for type: ${modalType}`);
    return null;
  }

  return (
    <ErrorBoundary onReset={closeModal}>
      <ModalComponent
        isOpen={isOpen}
        onClose={closeModal}
        {...modalProps}
      />
    </ErrorBoundary>
  );
}
