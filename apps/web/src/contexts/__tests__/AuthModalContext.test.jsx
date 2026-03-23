import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthModalProvider, useAuthModal } from '../AuthModalContext';

function AuthModalConsumer() {
  const { isAuthModalOpen, authModalMode, openAuthModal, closeAuthModal, handleVerifySuccess } =
    useAuthModal();
  return (
    <div>
      <span data-testid="is-open">{String(isAuthModalOpen)}</span>
      <span data-testid="mode">{authModalMode}</span>
      <button data-testid="open-default-btn" onClick={() => openAuthModal()}>
        Open Default
      </button>
      <button data-testid="open-register-btn" onClick={() => openAuthModal('register')}>
        Open Register
      </button>
      <button data-testid="close-btn" onClick={closeAuthModal}>
        Close
      </button>
      <button data-testid="verify-btn" onClick={handleVerifySuccess}>
        Verify
      </button>
    </div>
  );
}

describe('AuthModalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts closed with mode sign-in', () => {
      render(
        <AuthModalProvider>
          <AuthModalConsumer />
        </AuthModalProvider>
      );

      expect(screen.getByTestId('is-open').textContent).toBe('false');
      expect(screen.getByTestId('mode').textContent).toBe('sign-in');
    });
  });

  describe('openAuthModal', () => {
    it('opens with mode sign-in when called with no arguments', () => {
      render(
        <AuthModalProvider>
          <AuthModalConsumer />
        </AuthModalProvider>
      );

      act(() => {
        screen.getByTestId('open-default-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('true');
      expect(screen.getByTestId('mode').textContent).toBe('sign-in');
    });

    it('opens with the specified mode', () => {
      render(
        <AuthModalProvider>
          <AuthModalConsumer />
        </AuthModalProvider>
      );

      act(() => {
        screen.getByTestId('open-register-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('true');
      expect(screen.getByTestId('mode').textContent).toBe('register');
    });

    it('stores the onVerifySuccess callback', () => {
      let capturedCtx;

      const callback = vi.fn();

      function CallbackConsumer() {
        const ctx = useAuthModal();
        capturedCtx = ctx;
        return (
          <button
            data-testid="open-with-cb-btn"
            onClick={() => ctx.openAuthModal('sign-in', callback)}
          >
            Open With Callback
          </button>
        );
      }

      render(
        <AuthModalProvider>
          <CallbackConsumer />
        </AuthModalProvider>
      );

      act(() => {
        screen.getByTestId('open-with-cb-btn').click();
      });

      act(() => {
        capturedCtx.handleVerifySuccess();
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('updates mode correctly when re-opened with a different mode', () => {
      render(
        <AuthModalProvider>
          <AuthModalConsumer />
        </AuthModalProvider>
      );

      act(() => {
        screen.getByTestId('open-default-btn').click();
      });

      expect(screen.getByTestId('mode').textContent).toBe('sign-in');

      act(() => {
        screen.getByTestId('open-register-btn').click();
      });

      expect(screen.getByTestId('mode').textContent).toBe('register');
    });
  });

  describe('handleVerifySuccess', () => {
    it('calls the stored callback when one exists', () => {
      const callback = vi.fn();

      function CallbackConsumer() {
        const { openAuthModal, handleVerifySuccess } = useAuthModal();
        return (
          <div>
            <button
              data-testid="open-with-cb-btn"
              onClick={() => openAuthModal('sign-in', callback)}
            >
              Open
            </button>
            <button data-testid="verify-cb-btn" onClick={handleVerifySuccess}>
              Verify
            </button>
          </div>
        );
      }

      render(
        <AuthModalProvider>
          <CallbackConsumer />
        </AuthModalProvider>
      );

      act(() => {
        screen.getByTestId('open-with-cb-btn').click();
      });

      act(() => {
        screen.getByTestId('verify-cb-btn').click();
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not throw when no callback is stored', () => {
      render(
        <AuthModalProvider>
          <AuthModalConsumer />
        </AuthModalProvider>
      );

      act(() => {
        screen.getByTestId('open-default-btn').click();
      });

      expect(() => {
        act(() => {
          screen.getByTestId('verify-btn').click();
        });
      }).not.toThrow();
    });
  });

  describe('closeAuthModal', () => {
    it('closes the modal', () => {
      render(
        <AuthModalProvider>
          <AuthModalConsumer />
        </AuthModalProvider>
      );

      act(() => {
        screen.getByTestId('open-default-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('true');

      act(() => {
        screen.getByTestId('close-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('false');
    });

    it('clears the stored callback so handleVerifySuccess becomes a no-op', () => {
      const callback = vi.fn();

      function CallbackConsumer() {
        const { openAuthModal, closeAuthModal, handleVerifySuccess } = useAuthModal();
        return (
          <div>
            <button
              data-testid="open-with-cb-btn"
              onClick={() => openAuthModal('sign-in', callback)}
            >
              Open
            </button>
            <button data-testid="close-cb-btn" onClick={closeAuthModal}>
              Close
            </button>
            <button data-testid="verify-cb-btn" onClick={handleVerifySuccess}>
              Verify
            </button>
          </div>
        );
      }

      render(
        <AuthModalProvider>
          <CallbackConsumer />
        </AuthModalProvider>
      );

      act(() => {
        screen.getByTestId('open-with-cb-btn').click();
      });

      act(() => {
        screen.getByTestId('close-cb-btn').click();
      });

      act(() => {
        screen.getByTestId('verify-cb-btn').click();
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('useAuthModal outside provider', () => {
    it('throws when used outside an AuthModalProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      function Orphan() {
        useAuthModal();
        return null;
      }

      expect(() => render(<Orphan />)).toThrow(
        'useAuthModal must be used within an AuthModalProvider'
      );

      consoleError.mockRestore();
    });
  });
});
