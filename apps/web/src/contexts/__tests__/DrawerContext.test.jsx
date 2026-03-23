import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DrawerProvider, useDrawer, DRAWER_TYPES } from '../DrawerContext';

function DrawerConsumer() {
  const { isOpen, drawerType, drawerProps, openDrawer, closeDrawer } = useDrawer();
  return (
    <div>
      <span data-testid="is-open">{String(isOpen)}</span>
      <span data-testid="drawer-type">{drawerType ?? 'null'}</span>
      <span data-testid="drawer-props-id">{drawerProps?.playerId ?? 'null'}</span>
      <button
        data-testid="open-btn"
        onClick={() => openDrawer(DRAWER_TYPES.PLAYER_DETAILS, { playerId: 42 })}
      >
        Open
      </button>
      <button
        data-testid="open-no-props-btn"
        onClick={() => openDrawer(DRAWER_TYPES.PLAYER_DETAILS)}
      >
        Open No Props
      </button>
      <button data-testid="close-btn" onClick={closeDrawer}>
        Close
      </button>
    </div>
  );
}

describe('DrawerProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('drawer-open');
  });

  describe('initial state', () => {
    it('renders with isOpen false, drawerType null, and empty drawerProps', () => {
      render(
        <DrawerProvider>
          <DrawerConsumer />
        </DrawerProvider>
      );

      expect(screen.getByTestId('is-open').textContent).toBe('false');
      expect(screen.getByTestId('drawer-type').textContent).toBe('null');
      expect(screen.getByTestId('drawer-props-id').textContent).toBe('null');
    });
  });

  describe('openDrawer', () => {
    it('sets isOpen, drawerType, and drawerProps correctly', () => {
      render(
        <DrawerProvider>
          <DrawerConsumer />
        </DrawerProvider>
      );

      act(() => {
        screen.getByTestId('open-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('true');
      expect(screen.getByTestId('drawer-type').textContent).toBe(DRAWER_TYPES.PLAYER_DETAILS);
      expect(screen.getByTestId('drawer-props-id').textContent).toBe('42');
    });

    it('adds drawer-open class to document.body', () => {
      render(
        <DrawerProvider>
          <DrawerConsumer />
        </DrawerProvider>
      );

      act(() => {
        screen.getByTestId('open-btn').click();
      });

      expect(document.body.classList.contains('drawer-open')).toBe(true);
    });

    it('defaults drawerProps to an empty object when no props are passed', () => {
      render(
        <DrawerProvider>
          <DrawerConsumer />
        </DrawerProvider>
      );

      act(() => {
        screen.getByTestId('open-no-props-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('true');
      expect(screen.getByTestId('drawer-type').textContent).toBe(DRAWER_TYPES.PLAYER_DETAILS);
      expect(screen.getByTestId('drawer-props-id').textContent).toBe('null');
    });
  });

  describe('closeDrawer', () => {
    it('resets isOpen, drawerType, and drawerProps', () => {
      render(
        <DrawerProvider>
          <DrawerConsumer />
        </DrawerProvider>
      );

      act(() => {
        screen.getByTestId('open-btn').click();
      });

      act(() => {
        screen.getByTestId('close-btn').click();
      });

      expect(screen.getByTestId('is-open').textContent).toBe('false');
      expect(screen.getByTestId('drawer-type').textContent).toBe('null');
      expect(screen.getByTestId('drawer-props-id').textContent).toBe('null');
    });

    it('removes drawer-open class from document.body', () => {
      render(
        <DrawerProvider>
          <DrawerConsumer />
        </DrawerProvider>
      );

      act(() => {
        screen.getByTestId('open-btn').click();
      });

      expect(document.body.classList.contains('drawer-open')).toBe(true);

      act(() => {
        screen.getByTestId('close-btn').click();
      });

      expect(document.body.classList.contains('drawer-open')).toBe(false);
    });
  });

  describe('useDrawer outside provider', () => {
    it('throws when used outside a DrawerProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      function Orphan() {
        useDrawer();
        return null;
      }

      expect(() => render(<Orphan />)).toThrow('useDrawer must be used within a DrawerProvider');

      consoleError.mockRestore();
    });
  });

  describe('DRAWER_TYPES', () => {
    it('exports PLAYER_DETAILS key with matching string value', () => {
      expect(DRAWER_TYPES).toMatchObject({
        PLAYER_DETAILS: 'PLAYER_DETAILS',
      });
    });

    it('has string values equal to the key names', () => {
      for (const [key, value] of Object.entries(DRAWER_TYPES)) {
        expect(value).toBe(key);
      }
    });
  });
});
