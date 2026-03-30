/**
 * Shared test utilities for the Beach Kings web app.
 *
 * Provides reusable helpers to reduce boilerplate across test files.
 * Import as: import { createConsumer, mockNextNavigation, mockApi } from '@/test-utils';
 */

import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Create a lightweight consumer component for testing a context hook.
 *
 * Returns a component that renders data-testid spans for each field returned
 * by the hook. Also accepts an `onContext` prop to capture the full context
 * object for calling methods in tests.
 *
 * @param {Function} useHook - The context hook (e.g., useModal, useAuth)
 * @param {string[]} fields - Field names to render as data-testid spans
 * @returns {React.FC} A consumer component
 *
 * @example
 * const ModalConsumer = createConsumer(useModal, ['isOpen', 'modalType']);
 * render(<ModalProvider><ModalConsumer /></ModalProvider>);
 * expect(screen.getByTestId('isOpen').textContent).toBe('false');
 */
export function createConsumer(useHook: () => Record<string, unknown>, fields: string[]) {
  return function Consumer({ onContext }: { onContext?: (ctx: Record<string, unknown>) => void } = {}) {
    const ctx = useHook();
    React.useEffect(() => {
      if (onContext) onContext(ctx);
    });
    return (
      <div>
        {fields.map((field) => (
          <span key={field} data-testid={field}>
            {formatValue(ctx[field])}
          </span>
        ))}
      </div>
    );
  };
}

/**
 * Format a value for display in a data-testid span.
 * @param {*} value
 * @returns {string}
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === 'object') return '[object]';
  return String(value);
}

/**
 * Standard mock for next/navigation.
 * Call this at the top of test files that need router mocking.
 *
 * @returns {{ push: vi.fn, replace: vi.fn, refresh: vi.fn }}
 *
 * @example
 * const { mockRouter } = mockNextNavigation();
 * // ... in test:
 * expect(mockRouter.push).toHaveBeenCalledWith('/home');
 */
export function mockNextNavigation() {
  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };

  vi.mock('next/navigation', () => ({
    useRouter: vi.fn(() => mockRouter),
    usePathname: vi.fn(() => '/'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
  }));

  return { mockRouter };
}

/**
 * Create a mock API module object with vi.fn() for each named function.
 * Useful for `vi.mock('../../services/api', () => mockApi(...))`.
 *
 * @param {string[]} functionNames - Names of API functions to mock
 * @returns {Object} Mock module with vi.fn() for each function + default export
 *
 * @example
 * const apiMock = mockApi(['getPlayers', 'createPlayer']);
 * vi.mock('../../services/api', () => apiMock);
 */
export function mockApi(functionNames: string[]) {
  const mocks: Record<string, any> = {};
  for (const name of functionNames) {
    mocks[name] = vi.fn();
  }
  mocks.default = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return mocks;
}

/**
 * Render a component wrapped in one or more provider components.
 *
 * @param {React.ReactElement} ui - The component to render
 * @param {Object} options
 * @param {Array<React.FC>} [options.providers] - Provider components to wrap around ui (innermost first)
 * @param {Object} [options.renderOptions] - Additional options passed to RTL render
 * @returns {RenderResult} RTL render result
 *
 * @example
 * const result = renderWithProviders(<MyComponent />, {
 *   providers: [ToastProvider, ModalProvider],
 * });
 */
type AnyProvider = React.ComponentType<{ children?: React.ReactNode }>;

export function renderWithProviders(ui: React.ReactElement, { providers = [] as AnyProvider[], ...renderOptions } = {}) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return providers.reduceRight<React.ReactElement>(
      (acc, Provider) => <Provider>{acc}</Provider>,
      <>{children}</>
    );
  }
  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
