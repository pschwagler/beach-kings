import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ModalProvider, useModal, MODAL_TYPES } from '../ModalContext';

function ModalConsumer() {
  const { isOpen, modalType, modalProps, openModal, closeModal } = useModal();
  return (
    <div>
      <span data-testid="is-open">{String(isOpen)}</span>
      <span data-testid="modal-type">{modalType ?? 'null'}</span>
      <span data-testid="modal-props-name">{modalProps?.name ?? 'null'}</span>
      <button
        data-testid="open-btn"
        onClick={() => openModal(MODAL_TYPES.CREATE_LEAGUE, { name: 'My League' })}
      >
        Open
      </button>
      <button data-testid="open-no-props-btn" onClick={() => openModal(MODAL_TYPES.PLAYER_PROFILE)}>
        Open No Props
      </button>
      <button data-testid="close-btn" onClick={closeModal}>
        Close
      </button>
    </div>
  );
}

describe('ModalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('modal-open');
  });

  describe('initial state', () => {
    it('renders with isOpen false, modalType null, and empty modalProps', () => {
      render(
        <ModalProvider>
          <ModalConsumer />
        </ModalProvider>
      );

      expect(screen.getByTestId('is-open').textContent).toBe('false');
      expect(screen.getByTestId('modal-type').textContent).toBe('null');
      expect(screen.getByTestId('modal-props-name').textContent).toBe('null');
    });
  });

  describe('openModal', () => {
    it('sets isOpen, modalType, and modalProps correctly', () => {
      render(
        <ModalProvider>
          <ModalConsumer />
        </ModalProvider>
      );

      act(() => {
        screen.getByTestId('open-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('true');
      expect(screen.getByTestId('modal-type').textContent).toBe(MODAL_TYPES.CREATE_LEAGUE);
      expect(screen.getByTestId('modal-props-name').textContent).toBe('My League');
    });

    it('adds modal-open class to document.body', () => {
      render(
        <ModalProvider>
          <ModalConsumer />
        </ModalProvider>
      );

      act(() => {
        screen.getByTestId('open-btn').click();
      });

      expect(document.body.classList.contains('modal-open')).toBe(true);
    });

    it('defaults modalProps to an empty object when no props are passed', () => {
      render(
        <ModalProvider>
          <ModalConsumer />
        </ModalProvider>
      );

      act(() => {
        screen.getByTestId('open-no-props-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('true');
      expect(screen.getByTestId('modal-type').textContent).toBe(MODAL_TYPES.PLAYER_PROFILE);
      expect(screen.getByTestId('modal-props-name').textContent).toBe('null');
    });
  });

  describe('closeModal', () => {
    it('resets isOpen, modalType, and modalProps', () => {
      render(
        <ModalProvider>
          <ModalConsumer />
        </ModalProvider>
      );

      act(() => {
        screen.getByTestId('open-btn').click();
      });

      act(() => {
        screen.getByTestId('close-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('false');
      expect(screen.getByTestId('modal-type').textContent).toBe('null');
      expect(screen.getByTestId('modal-props-name').textContent).toBe('null');
    });

    it('removes modal-open class from document.body', () => {
      render(
        <ModalProvider>
          <ModalConsumer />
        </ModalProvider>
      );

      act(() => {
        screen.getByTestId('open-btn').click();
      });

      expect(document.body.classList.contains('modal-open')).toBe(true);

      act(() => {
        screen.getByTestId('close-btn').click();
      });

      expect(document.body.classList.contains('modal-open')).toBe(false);
    });
  });

  describe('useModal outside provider', () => {
    it('throws when used outside a ModalProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      function Orphan() {
        useModal();
        return null;
      }

      expect(() => render(<Orphan />)).toThrow('useModal must be used within a ModalProvider');

      consoleError.mockRestore();
    });
  });

  describe('MODAL_TYPES', () => {
    it('exports the expected modal type keys', () => {
      expect(MODAL_TYPES).toMatchObject({
        CREATE_LEAGUE: 'CREATE_LEAGUE',
        PLAYER_PROFILE: 'PLAYER_PROFILE',
        ADD_MATCH: 'ADD_MATCH',
        EDIT_SCHEDULE: 'EDIT_SCHEDULE',
        SIGNUP: 'SIGNUP',
        CONFIRMATION: 'CONFIRMATION',
        SESSION_SUMMARY: 'SESSION_SUMMARY',
        UPLOAD_PHOTO: 'UPLOAD_PHOTO',
        REVIEW_PHOTO_MATCHES: 'REVIEW_PHOTO_MATCHES',
        CREATE_GAME: 'CREATE_GAME',
        SHARE_FALLBACK: 'SHARE_FALLBACK',
        FEEDBACK: 'FEEDBACK',
      });
    });

    it('has string values equal to the key names', () => {
      for (const [key, value] of Object.entries(MODAL_TYPES)) {
        expect(value).toBe(key);
      }
    });
  });
});
