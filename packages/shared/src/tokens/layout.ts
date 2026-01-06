/**
 * Unified Layout Tokens
 * Layout dimensions extracted from web App.css :root variables
 */

export const layout = {
  navbarHeight: 53,
  sidebarWidthHome: 220,
  sidebarWidthLeague: 240,
  sidebarWidthCollapsed: 72,
} as const;

export type LayoutName = keyof typeof layout;
