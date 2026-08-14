import React from 'react';
import {
  render as renderTestingLibrary,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react-native';
import ThemeProvider from '@/contexts/ThemeContext';

/** Render UI with the same required theme boundary used by the app root. */
export function renderWithTheme(
  ui: React.ReactElement,
  options?: RenderOptions,
): RenderResult {
  return renderTestingLibrary(<ThemeProvider>{ui}</ThemeProvider>, options);
}
