/**
 * React class-based error boundary.
 * Catches uncaught JS errors in any child tree and renders a fallback UI.
 * Must be a class component — React only supports componentDidCatch in classes.
 */

import React, { ReactNode } from 'react';
import { View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangleIcon } from '@/components/ui/icons';
import Button from '@/components/ui/Button';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { captureOperationalError } from '@/telemetry/sentry';

function DefaultErrorFallback({
  error,
  onReset,
}: {
  readonly error: Error | null;
  readonly onReset: () => void;
}): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-surface">
      <View className="flex-1 items-center justify-center px-xl gap-lg">
        <AlertTriangleIcon size={48} color={palette.warning} />
        <AppText className="text-xl font-semibold text-default text-center">
          Something went wrong
        </AppText>
        {__DEV__ && error !== null && (
          <AppText className="text-sm text-danger text-center">
            {error.message}
          </AppText>
        )}
        <Button title="Try Again" onPress={onReset} variant="primary" />
      </View>
    </SafeAreaView>
  );
}

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureOperationalError(error);
    // Log error details without leaking sensitive context to the user.
    if (__DEV__) {
      console.error('[ErrorBoundary] Caught error:', error, info);
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (!hasError) {
      return children;
    }

    if (fallback !== undefined) {
      return fallback;
    }

    return <DefaultErrorFallback error={error} onReset={this.handleReset} />;
  }
}
