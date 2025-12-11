import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';
import config from '../tamagui.config';
import { AuthProvider } from '../src/contexts/AuthContext';
import { AppProvider } from '../src/contexts/AppContext';
import { ModalProvider } from '../src/contexts/ModalContext';
import { DrawerProvider } from '../src/contexts/DrawerContext';
import { AuthModalProvider } from '../src/contexts/AuthModalContext';

export default function RootLayout() {
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <SafeAreaProvider>
        <AuthProvider>
          <AppProvider>
            <AuthModalProvider>
              <ModalProvider>
                <DrawerProvider>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                    }}
                  >
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="index" />
                    <Stack.Screen name="login" />
                    <Stack.Screen name="signup" />
                    <Stack.Screen name="reset-password" />
                    <Stack.Screen name="league/[id]" />
                    <Stack.Screen name="admin-view" />
                  </Stack>
                </DrawerProvider>
              </ModalProvider>
            </AuthModalProvider>
          </AppProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}


