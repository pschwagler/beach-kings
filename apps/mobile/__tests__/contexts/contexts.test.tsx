/**
 * Tests for NotificationContext and ToastContext providers and hooks.
 */
import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { renderHook, act } from '@testing-library/react-native';

import NotificationProvider, { useNotifications } from '@/contexts/NotificationContext';
import ToastProvider, { useToast } from '@/contexts/ToastContext';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null }),
}));

// react-native-reanimated is already mapped to its mock via jest.config.js
// moduleNameMapper, so no additional factory mock is needed here.

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

// ---------------------------------------------------------------------------
// NotificationContext
// ---------------------------------------------------------------------------
describe('NotificationContext', () => {
  it('throws when useNotifications is called outside provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useNotifications())).toThrow(
      'useNotifications must be used within a NotificationProvider',
    );
    consoleError.mockRestore();
  });

  it('provides initial empty notifications state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider>{children}</NotificationProvider>
    );
    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.dmUnreadCount).toBe(0);
  });

  it('markAsRead is a function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider>{children}</NotificationProvider>
    );
    const { result } = renderHook(() => useNotifications(), { wrapper });
    expect(typeof result.current.markAsRead).toBe('function');
    expect(typeof result.current.markAllAsRead).toBe('function');
  });

  it('addNotificationListener returns an unsubscribe function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider>{children}</NotificationProvider>
    );
    const { result } = renderHook(() => useNotifications(), { wrapper });
    const unsubscribe = result.current.addNotificationListener('test', jest.fn());
    expect(typeof unsubscribe).toBe('function');
    act(() => { unsubscribe(); });
  });
});

// ---------------------------------------------------------------------------
// ToastContext
// ---------------------------------------------------------------------------
describe('ToastContext', () => {
  it('throws when useToast is called outside provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within a ToastProvider',
    );
    consoleError.mockRestore();
  });

  it('showToast renders toast message in the tree', () => {
    function Consumer(): React.ReactElement {
      const { showToast } = useToast();
      return (
        <Pressable testID="trigger" onPress={() => showToast('Hello toast!')}>
          <Text>Press me</Text>
        </Pressable>
      );
    }

    const { getByTestId, queryByText } = render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    expect(queryByText('Hello toast!')).toBeNull();
    fireEvent.press(getByTestId('trigger'));
    expect(queryByText('Hello toast!')).toBeTruthy();
  });

  it('showToast defaults to info type without crashing', () => {
    function Consumer(): React.ReactElement {
      const { showToast } = useToast();
      return (
        <Pressable testID="trigger" onPress={() => showToast('Info message')}>
          <Text>Press</Text>
        </Pressable>
      );
    }

    const { getByTestId } = render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    expect(() => fireEvent.press(getByTestId('trigger'))).not.toThrow();
  });
});
