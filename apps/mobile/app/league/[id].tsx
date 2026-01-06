import { YStack } from 'tamagui';
import { Text } from '../../src/components/ui/Text';
import { useLocalSearchParams } from 'expo-router';

export default function LeagueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$sand"
      padding="$5"
    >
      <Text
        fontSize={28}
        fontWeight="700"
        color="#1e90ff"
        marginBottom="$2.5"
      >
        League Details
      </Text>
      <Text
        fontSize={18}
        color="#666666"
      >
        League ID: {id}
      </Text>
    </YStack>
  );
}
