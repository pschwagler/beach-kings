/**
 * HomeMenuBar — unit tests.
 *
 * Verifies that tab navigation uses `useSearchParams()` (from next/navigation)
 * rather than `window.location.search`, and that the Friends button has an
 * aria-label for accessibility.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams('foo=bar');

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/home'),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

vi.mock('../../../contexts/NotificationContext', () => ({
  useNotifications: vi.fn(() => ({ dmUnreadCount: 0 })),
}));

// Stub MenuBar to render items in a testable way
vi.mock('../../navigation/MenuBar', () => ({
  default: ({
    items,
    children,
  }: {
    items: Array<{ id: string; label: string; onClick: () => void; title?: string }>;
    children?: (args: { moreButtonRef: React.RefObject<HTMLButtonElement> }) => React.ReactNode;
  }) => {
    const ref = React.createRef<HTMLButtonElement>();
    return (
      <nav>
        {items.map((item) => (
          <button
            key={item.id}
            data-testid={`menu-item-${item.id}`}
            onClick={item.onClick}
            title={item.title}
            aria-label={item.title}
          >
            {item.label}
          </button>
        ))}
        {children && children({ moreButtonRef: ref as React.RefObject<HTMLButtonElement> })}
      </nav>
    );
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useSearchParams } from 'next/navigation';
import HomeMenuBar from '../HomeMenuBar';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HomeMenuBar — tab navigation uses useSearchParams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    // Restore the default mock return value
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('foo=bar'),
    );
  });

  it('calls useSearchParams to read the current query string', () => {
    render(<HomeMenuBar activeTab="home" />);
    expect(useSearchParams).toHaveBeenCalled();
  });

  it('preserves existing search params when navigating to a tab', () => {
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('foo=bar'),
    );
    render(<HomeMenuBar activeTab="home" />);

    fireEvent.click(screen.getByTestId('menu-item-profile'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('tab=profile'),
    );
    // The pre-existing param must also be present
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('foo=bar'),
    );
  });

  it('navigates to /home with the correct tab param when a menu item is clicked', () => {
    render(<HomeMenuBar activeTab="home" />);

    fireEvent.click(screen.getByTestId('menu-item-leagues'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/^\/home\?/),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('tab=leagues'),
    );
  });

  it('does NOT read window.location.search — uses hook value instead', () => {
    // Give window.location.search a value that differs from the hook's value
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?stale=true' },
      writable: true,
    });

    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('hook=live'),
    );

    render(<HomeMenuBar activeTab="home" />);
    fireEvent.click(screen.getByTestId('menu-item-friends'));

    // The URL must contain the hook value, not the stale window value
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('hook=live'),
    );
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining('stale=true'),
    );
  });
});

describe('HomeMenuBar — Friends button accessibility', () => {
  it('renders a Friends nav item with aria-label', () => {
    render(<HomeMenuBar activeTab="friends" />);
    const friendsBtn = screen.getByTestId('menu-item-friends');
    // The MenuBar stub propagates aria-label from title
    expect(friendsBtn).toHaveAttribute('aria-label', 'Friends');
  });
});
