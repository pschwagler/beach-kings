/**
 * SessionDetailErrorState — shown when session detail fetch fails.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Props {
  readonly onRetry: () => void;
}

export default function SessionDetailErrorState({ onRetry }: Props): React.ReactNode {
  return (
    <View
      testID="session-detail-error"
      className="flex-1 items-center justify-center px-[24px] gap-[16px]"
    >
      <Text className="text-[16px] font-semibold text-text-default dark:text-content-primary text-center">
        Could not load session
      </Text>
      <Text className="text-[14px] text-text-secondary dark:text-content-secondary text-center">
        Check your connection and try again.
      </Text>
      <TouchableOpacity
        testID="session-detail-retry-btn"
        onPress={onRetry}
        className="bg-[#1a3a4a] px-[24px] py-[12px] rounded-[10px]"
      >
        <Text className="text-white text-[14px] font-semibold">Retry</Text>
      </TouchableOpacity>
    </View>
  );
}
