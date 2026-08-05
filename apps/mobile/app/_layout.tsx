import '../global.css';

import React, { useEffect, useCallback, useMemo } from 'react';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AuthProvider from '@/contexts/AuthContext';
import ThemeProvider, { useTheme } from '@/contexts/ThemeContext';
import { NotificationTransport } from '@/features/notifications';
import {
  createQueryClient,
  PrivateQueryCacheGuard,
  subscribeQueryLifecycle,
} from '@/infrastructure/query';
import ToastProvider from '@/contexts/ToastContext';
import ErrorBoundary from '@/lib/ErrorBoundary';

// Fonts are embedded at build time by the expo-font config plugin. Keep the
// splash visible only until the provider tree and navigation are mounted.
SplashScreen.preventAutoHideAsync();

/**
 * Inner layout that consumes ThemeContext for dynamic StatusBar.
 * Must be a child of ThemeProvider to call useTheme().
 */
function RootLayoutInner({ onReady }: { readonly onReady: () => void }): React.ReactNode {
  const { isDark } = useTheme();

  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/*
        Root stack. Making the root a real <Stack> (not a bare <Slot />) is what
        gives the app a single, shared back-history: pushing a `(stack)` detail
        screen stacks it OVER the still-mounted `(tabs)`, so `router.back()`
        pops back to whichever tab the user came from. See docs/navigation.md.

          - (tabs)/(auth): lateral swaps driven by the auth guard (router.replace)
            — no back-swipe out of them (gestureEnabled: false), fade transition.
          - (stack): detail screens pushed over the tabs — iOS swipe-to-dismiss
            and slide-from-right feel.
      */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="(auth)"
          options={{ gestureEnabled: false, animation: 'fade' }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{ gestureEnabled: false, animation: 'fade' }}
        />
        <Stack.Screen name="(stack)" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default function RootLayout(): React.ReactNode {
  const queryClient = useMemo(() => createQueryClient(), []);

  useEffect(() => subscribeQueryLifecycle(), []);

  const handleReady = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <PrivateQueryCacheGuard>
                <NotificationTransport />
                <ToastProvider>
                  <ErrorBoundary>
                    <RootLayoutInner onReady={handleReady} />
                  </ErrorBoundary>
                </ToastProvider>
              </PrivateQueryCacheGuard>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
