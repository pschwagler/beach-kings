import React from 'react';
import { useModal, MODAL_TYPES } from '../contexts/ModalContext';
import ConfirmationModal from './ConfirmationModal';
import ErrorBoundary from './ErrorBoundary';

// Map modal types to their components
// As we migrate more components, we'll add them here
const MODAL_COMPONENTS: Record<string, React.ComponentType<any>> = {
  [MODAL_TYPES.CONFIRMATION]: ConfirmationModal,
  // TODO: Add more modal components as they are migrated:
  // [MODAL_TYPES.CREATE_LEAGUE]: CreateLeagueModal,
  // [MODAL_TYPES.PLAYER_PROFILE]: PlayerProfileModal,
  // [MODAL_TYPES.ADD_MATCH]: AddMatchModal,
  // [MODAL_TYPES.EDIT_SCHEDULE]: EditWeeklyScheduleModal,
  // [MODAL_TYPES.SIGNUP]: SignupModal,
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
