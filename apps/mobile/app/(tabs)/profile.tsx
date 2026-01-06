import { YStack, ScrollView } from 'tamagui';
import { Text } from '../../src/components/ui/Text';

export default function ProfileScreen() {
  return (
    <ScrollView flex={1} backgroundColor="$sand">
      <YStack padding="$5">
        <Text
          fontSize={32}
          fontWeight="700"
          color="#1e90ff"
          marginBottom="$2.5"
        >
          Profile
        </Text>
        <Text
          fontSize={18}
          color="#666666"
        >
          Your profile
        </Text>
      </YStack>
    </ScrollView>
  );
}
