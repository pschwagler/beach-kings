import { useDrawer, DRAWER_TYPES } from '../../contexts/DrawerContext';
import PlayerDetailsPanel from '../player/PlayerDetailsPanel';
import ErrorBoundary from './ErrorBoundary';

export default function GlobalDrawer() {
  const { isOpen, drawerType, drawerProps, closeDrawer } = useDrawer();

  if (!isOpen) return null;

  switch (drawerType) {
    case DRAWER_TYPES.PLAYER_DETAILS:
      return (
        <ErrorBoundary onReset={closeDrawer}>
          <PlayerDetailsPanel
            isPanelOpen={isOpen}
            onClose={closeDrawer}
            {...drawerProps}
          />
        </ErrorBoundary>
      );
    default:
      return null;
  }
}
