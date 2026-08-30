import React from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppText from '@/components/ui/AppText';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { useBack } from '@/hooks/useBack';
import { usePaletteColors } from '@/theme/usePaletteColors';
import MessagesBody from './MessagesBody';
import { useMessagesScreen } from './useMessagesScreen';

export default function HiddenMessagesScreen(): React.ReactNode {
  const palette = usePaletteColors();
  const onBack = useBack();
  const state = useMessagesScreen('hidden');

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <View className="h-12 bg-nav flex-row items-center px-3 border-b border-divider">
        <Pressable
          testID="hidden-messages-back"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Messages"
          className="min-w-touch min-h-touch flex-row items-center"
        >
          <ChevronLeftIcon size={18} color={palette.textInverse} />
        </Pressable>
        <AppText accessibilityRole="header" className="text-inverse text-[16px] font-bold">
          Hidden Messages
        </AppText>
      </View>
      <MessagesBody {...state} />
    </SafeAreaView>
  );
}
