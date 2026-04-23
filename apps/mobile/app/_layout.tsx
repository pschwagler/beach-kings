import '../global.css';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { QueryClientProvider } from '@tanstack/react-query';
import AuthProvider from '@/contexts/AuthContext';
import ThemeProvider, { useTheme } from '@/contexts/ThemeContext';
import NotificationProvider from '@/contexts/NotificationContext';
import ToastProvider from '@/contexts/ToastContext';
import ErrorBoundary from '@/lib/ErrorBoundary';
import { createQueryClient } from '@/lib/queryClient';

// Prevent splash screen from auto-hiding until fonts + auth are ready
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
      <Slot />
    </>
  );
}

export default function RootLayout(): React.ReactNode {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const queryClient = useMemo(() => createQueryClient(), []);

  useEffect(() => {
    async function loadFonts() {
      try {
        // Load custom fonts here when added to assets/fonts/
        await Font.loadAsync({});
      } catch {
        // Font loading failed — continue with system fonts
      } finally {
        setFontsLoaded(true);
      }
    }
    loadFonts();
  }, []);

  const handleReady = useCallback(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <ToastProvider>
              <ErrorBoundary>
                <RootLayoutInner onReady={handleReady} />
              </ErrorBoundary>
            </ToastProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
