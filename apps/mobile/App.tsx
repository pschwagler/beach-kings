import { StatusBar } from 'expo-status-bar';
import { YStack, Text } from 'tamagui';

export default function App() {
  return (
    <YStack
      flex={1}
      backgroundColor="$backgroundLight"
      alignItems="center"
      justifyContent="center"
    >
      <Text>Open up App.tsx to start working on your app!</Text>
      <StatusBar style="auto" />
    </YStack>
  );
}
