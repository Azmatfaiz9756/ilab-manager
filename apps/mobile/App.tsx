import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from './src/store/authStore';
import { colors, spacing } from './src/theme/colors';

// Screens
import { AuthScreen } from './src/screens/AuthScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { NewDeviceIntakeScreen } from './src/screens/NewDeviceIntakeScreen';
import { MyRepairsScreen } from './src/screens/MyRepairsScreen';
import { QCScreen } from './src/screens/QCScreen';
import { IMEISearchScreen } from './src/screens/IMEISearchScreen';
import { TeamScreen } from './src/screens/TeamScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type Tab = 'dashboard' | 'intake' | 'repairs' | 'qc' | 'search' | 'team';

function MainApp() {
  const { isAuthenticated, isLoading, initAuth } = useAuthStore();
  const [currentTab, setCurrentTab] = useState<Tab>('dashboard');

  useEffect(() => {
    initAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Active Tab Screen */}
        <View style={styles.screenContainer}>
          {currentTab === 'dashboard' && <DashboardScreen />}
          {currentTab === 'intake' && <NewDeviceIntakeScreen onSuccess={() => setCurrentTab('repairs')} />}
          {currentTab === 'repairs' && <MyRepairsScreen />}
          {currentTab === 'qc' && <QCScreen />}
          {currentTab === 'search' && <IMEISearchScreen />}
          {currentTab === 'team' && <TeamScreen />}
        </View>

        {/* Bottom Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, currentTab === 'dashboard' && styles.activeTabItem]}
            onPress={() => setCurrentTab('dashboard')}
          >
            <Text style={[styles.tabLabel, currentTab === 'dashboard' && styles.activeTabLabel]}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, currentTab === 'intake' && styles.activeTabItem]}
            onPress={() => setCurrentTab('intake')}
          >
            <Text style={[styles.tabLabel, currentTab === 'intake' && styles.activeTabLabel]}>+ Intake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, currentTab === 'repairs' && styles.activeTabItem]}
            onPress={() => setCurrentTab('repairs')}
          >
            <Text style={[styles.tabLabel, currentTab === 'repairs' && styles.activeTabLabel]}>Repairs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, currentTab === 'qc' && styles.activeTabItem]}
            onPress={() => setCurrentTab('qc')}
          >
            <Text style={[styles.tabLabel, currentTab === 'qc' && styles.activeTabLabel]}>QC</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, currentTab === 'search' && styles.activeTabItem]}
            onPress={() => setCurrentTab('search')}
          >
            <Text style={[styles.tabLabel, currentTab === 'search' && styles.activeTabLabel]}>Search</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, currentTab === 'team' && styles.activeTabItem]}
            onPress={() => setCurrentTab('team')}
          >
            <Text style={[styles.tabLabel, currentTab === 'team' && styles.activeTabLabel]}>Team</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainApp />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  activeTabItem: {
    borderTopWidth: 2,
    borderTopColor: colors.primaryLight,
  },
  tabLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeTabLabel: {
    color: colors.primaryLight,
    fontWeight: '800',
  },
});
