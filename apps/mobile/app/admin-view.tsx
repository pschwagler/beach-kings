import { YStack } from 'tamagui';
import { Text } from '../src/components/ui/Text';
import { getTokens } from 'tamagui';

export default function AdminView() {
  const tokens = getTokens();
  
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background"
      padding="$5"
    >
      <Text
        fontSize={28}
        fontWeight="700"
        color={tokens.color.oceanBlue.val}
        marginBottom="$2.5"
      >
        Admin View
      </Text>
      <Text
        fontSize={18}
        color={tokens.color.textSecondary.val}
      >
        Admin functionality coming soon
      </Text>
    </YStack>
  );
}
