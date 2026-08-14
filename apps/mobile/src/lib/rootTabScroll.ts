export type RootTabKey = 'home' | 'leagues' | 'add-games' | 'social' | 'profile';

type ScrollHandler = () => void;

const handlers = new Map<RootTabKey, ScrollHandler>();

/** Registers the primary scroll surface for a root tab. */
export function registerRootTabScroll(
  tab: RootTabKey,
  handler: ScrollHandler,
): () => void {
  handlers.set(tab, handler);
  return () => {
    if (handlers.get(tab) === handler) {
      handlers.delete(tab);
    }
  };
}

/** Invoked by the tab navigator when an already-focused tab is pressed. */
export function scrollRootTabToTop(tab: RootTabKey): void {
  handlers.get(tab)?.();
}
