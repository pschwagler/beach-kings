/**
 * React class-based error boundary.
 * Catches uncaught JS errors in any child tree and renders a fallback UI.
 * Must be a class component — React only supports componentDidCatch in classes.
 */

import React, { ReactNode } from 'react';
import { SafeAreaView, View, Text } from 'react-native';
import { AlertTriangleIcon } from '@/components/ui/icons';
import Button from '@/components/ui/Button';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log error details without leaking sensitive context to the user.
    if (__DEV__) {
      // eslint-disable-next-line no-console
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

    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-surface-dark">
        <View className="flex-1 items-center justify-center px-xl gap-lg">
          <AlertTriangleIcon size={48} color="#f59e0b" />
          <Text className="text-xl font-semibold text-gray-900 dark:text-white text-center">
            Something went wrong
          </Text>
          {__DEV__ && error !== null && (
            <Text className="text-sm text-danger dark:text-danger-text text-center font-mono">
              {error.message}
            </Text>
          )}
          <Button title="Try Again" onPress={this.handleReset} variant="primary" />
        </View>
      </SafeAreaView>
    );
  }
}
