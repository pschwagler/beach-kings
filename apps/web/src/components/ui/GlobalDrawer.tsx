import { Suspense, lazy } from 'react';
import { useDrawer, DRAWER_TYPES } from '../../contexts/DrawerContext';
import ErrorBoundary from './ErrorBoundary';

const PlayerDetailsPanel = lazy(() => import('../player/PlayerDetailsPanel'));

export default function GlobalDrawer() {
  const { isOpen, drawerType, drawerProps, closeDrawer } = useDrawer();

  if (!isOpen) return null;

  switch (drawerType) {
    case DRAWER_TYPES.PLAYER_DETAILS:
      return (
        <ErrorBoundary onReset={closeDrawer}>
          <Suspense fallback={null}>
            <PlayerDetailsPanel
              isPanelOpen={isOpen}
              onClose={closeDrawer}
              {...(drawerProps as any)}
            />
          </Suspense>
        </ErrorBoundary>
      );
    default:
      return null;
  }
}
