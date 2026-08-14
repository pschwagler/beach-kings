/**
 * Unified Layout Tokens
 * From design-tokens.css — mobile-first dimensions
 */

export const layout = {
  // Mobile layout
  screenWidth: 390,
  screenHeight: 844,
  statusBarHeight: 54,
  navBarHeight: 44,
  tabBarHeight: 82,
  contentInset: 16,
  cardPadding: 16,

  // Border radii (from wireframe components)
  radiusCard: 12,
  radiusButton: 12,
  radiusModal: 16,
  radiusChip: 20,
  radiusPill: 16,
  radiusInput: 8,
  radiusFull: 9999,

  // Touch targets (Apple HIG)
  touchTargetMin: 44,
  iconBtnSize: 44,
  iconVisualSize: 24,

  // Web layout (kept for apps/web)
  navbarHeight: 53,
  sidebarWidthHome: 220,
  sidebarWidthLeague: 240,
  sidebarWidthCollapsed: 72,
} as const;

export type LayoutName = keyof typeof layout;
