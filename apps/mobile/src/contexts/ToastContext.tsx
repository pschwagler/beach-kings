/**
 * Toast context — slide-down notifications with reanimated animation.
 * Provides showToast() to display transient success/error/info messages.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useMemo,
} from 'react';
import { Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly type: ToastType;
}

interface ToastContextValue {
  readonly showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to show toasts.
 * Must be used within ToastProvider.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const TOAST_DURATION = 3000;
const ANIMATION_DURATION = 300;

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-green-700',
  error: 'bg-red-700',
  info: 'bg-blue-700',
};

let nextToastId = 0;

interface ToastProviderProps {
  readonly children: React.ReactNode;
}

export default function ToastProvider({ children }: ToastProviderProps): React.ReactNode {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextToastId;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.map((toast, index) => (
        <AnimatedToast
          key={toast.id}
          toast={toast}
          index={index}
          onDismiss={dismissToast}
        />
      ))}
    </ToastContext.Provider>
  );
}

interface AnimatedToastProps {
  readonly toast: Toast;
  readonly index: number;
  readonly onDismiss: (id: number) => void;
}

function AnimatedToast({ toast, index, onDismiss }: AnimatedToastProps): React.ReactNode {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);

  useEffect(() => {
    // Slide in
    translateY.value = withTiming(0, { duration: ANIMATION_DURATION });

    // Auto-dismiss: slide out then remove
    translateY.value = withDelay(
      TOAST_DURATION,
      withTiming(-100, { duration: ANIMATION_DURATION }, (finished) => {
        if (finished) {
          runOnJS(onDismiss)(toast.id);
        }
      }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const topOffset = insets.top + 8 + index * 56;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: topOffset,
          left: 16,
          right: 16,
          zIndex: 9999,
        },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => onDismiss(toast.id)}
        className={`${TYPE_STYLES[toast.type]} rounded-xl px-4 py-3 shadow-lg`}
        accessibilityRole="alert"
      >
        <Text className="text-white text-sm font-medium">{toast.message}</Text>
      </Pressable>
    </Animated.View>
  );
}
