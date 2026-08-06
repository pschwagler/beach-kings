import { Stack } from 'expo-router';

export default function AccountLayout(): React.ReactNode {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
