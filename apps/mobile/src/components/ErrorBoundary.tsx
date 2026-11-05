import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={styles.title}>{this.props.fallbackTitle || 'Screen Error Recovered'}</Text>
            <Text style={styles.message}>
              An unexpected render issue was safely intercepted to protect your active session.
            </Text>
            {this.state.error?.message && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{this.state.error.message}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.resetBtn} onPress={this.handleReset}>
              <Text style={styles.resetBtnText}>🔄 Reload Screen</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    width: '100%',
    marginBottom: spacing.lg,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  resetBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
  },
  resetBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
