import React, { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';

/** Keep a date draft visible until saved/cancelled, including native root gestures. */
export default function InlineDateNavigationGuard({ onDismiss }: {
  readonly onDismiss: () => void;
}): React.ReactNode {
  const navigation = useNavigation();
  useFocusEffect(useCallback(() => {
    const parent = navigation.getParent();
    navigation.setOptions({ gestureEnabled: false });
    parent?.setOptions({ gestureEnabled: false });
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => {
      subscription.remove();
      navigation.setOptions({ gestureEnabled: true });
      parent?.setOptions({ gestureEnabled: true });
    };
  }, [navigation, onDismiss]));
  return null;
}
