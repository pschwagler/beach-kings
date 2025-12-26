import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTamaguiTheme } from '../hooks/useTamaguiTheme';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI or use default
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

function ErrorFallback({ onReset }: { onReset?: () => void }) {
  const theme = useTamaguiTheme();

  const styles = StyleSheet.create({
    container: {
      padding: theme.spacing.lg,
      margin: theme.spacing.lg,
      backgroundColor: theme.colors.dangerLight,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      borderRadius: theme.radius.md,
      alignItems: 'center',
    },
    title: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.danger,
      marginBottom: theme.spacing.sm,
    },
    message: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.md,
      textAlign: 'center',
    },
    button: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.oceanBlue,
      borderRadius: theme.radius.md,
    },
    buttonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.textWhite,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>
        We encountered an error while displaying this content.
      </Text>
      {onReset && (
        <Pressable style={styles.button} onPress={onReset}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      )}
    </View>
  );
}

export default ErrorBoundary;


