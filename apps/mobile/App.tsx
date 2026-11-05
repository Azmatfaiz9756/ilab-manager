import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar as NativeStatusBar,
  BackHandler,
  Alert,
} from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from './src/store/authStore';
import { useSettingsStore } from './src/store/settingsStore';
import { colors, spacing } from './src/theme/colors';
import { UserRole } from './src/shared';

// Screens
import { AuthScreen } from './src/screens/AuthScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { NewDeviceIntakeScreen } from './src/screens/NewDeviceIntakeScreen';
import { MyRepairsScreen } from './src/screens/MyRepairsScreen';
import { QCScreen } from './src/screens/QCScreen';
import { IMEISearchScreen } from './src/screens/IMEISearchScreen';
import { TeamScreen } from './src/screens/TeamScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type Tab = 'dashboard' | 'intake' | 'repairs' | 'qc' | 'search' | 'team' | 'analytics' | 'settings';

function MainApp() {
  const { isAuthenticated, isLoading, initAuth, user } = useAuthStore();
  const { initSettings } = useSettingsStore();
  const insets = useSafeAreaInsets();

  const role = user?.role || UserRole.VIEWER;
  const isHardwareTech = role === UserRole.BOARD_TECHNICIAN;
  const isQCTech = role === UserRole.QC_TECHNICIAN;
  const isOwnerOrManager =
    role === UserRole.LAB_OWNER || role === UserRole.LAB_MANAGER || role === UserRole.SUPER_ADMIN;

  const defaultRoleTab: Tab = isHardwareTech ? 'repairs' : isQCTech ? 'intake' : 'dashboard';
  const [currentTab, setCurrentTab] = useState<Tab>(defaultRoleTab);

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (NativeStatusBar.currentHeight || 28) : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 12);

  useEffect(() => {
    initAuth();
    initSettings();
  }, []);

  // Set default starting tab strictly based on user role upon login / role switch
  useEffect(() => {
    if (!user) return;
    if (isHardwareTech) {
      if (currentTab === 'dashboard' || currentTab === 'intake' || currentTab === 'team' || currentTab === 'analytics') {
        setCurrentTab('repairs');
      }
    } else if (isQCTech) {
      if (currentTab === 'dashboard' || currentTab === 'repairs' || currentTab === 'team' || currentTab === 'analytics') {
        setCurrentTab('intake');
      }
    } else if (isOwnerOrManager) {
      if (currentTab === 'intake') {
        setCurrentTab('dashboard');
      }
    }
  }, [user?.id, role]);

  // Android Hardware Back Button navigation: Prevent accidental logouts
  useEffect(() => {
    const defaultTab: Tab = isHardwareTech ? 'repairs' : isQCTech ? 'intake' : 'dashboard';

    const onBackPress = () => {
      if (!isAuthenticated) return false;

      // If user is on a secondary tab, take them back to their primary home tab
      if (currentTab !== defaultTab) {
        setCurrentTab(defaultTab);
        return true;
      }

      // If already on primary tab, confirm before exiting without logging out
      Alert.alert(
        'Exit iLab Manager',
        'Are you sure you want to exit the application?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Exit', onPress: () => BackHandler.exitApp() },
        ]
      );
      return true;
    };

    const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSub.remove();
  }, [currentTab, isAuthenticated, isHardwareTech, isQCTech]);

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <View style={[styles.safeArea, { paddingTop: topInset }]}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Active Tab Screen */}
        <View style={styles.screenContainer}>
          <ErrorBoundary fallbackTitle="Screen Recovery">
            {currentTab === 'dashboard' && <DashboardScreen />}
            {currentTab === 'intake' && <NewDeviceIntakeScreen onSuccess={() => setCurrentTab('qc')} />}
            {currentTab === 'repairs' && <MyRepairsScreen />}
            {currentTab === 'qc' && <QCScreen />}
            {currentTab === 'search' && <IMEISearchScreen />}
            {currentTab === 'team' && <TeamScreen />}
            {currentTab === 'analytics' && <AnalyticsScreen />}
            {currentTab === 'settings' && <SettingsScreen />}
          </ErrorBoundary>
        </View>

        {/* Bottom Tab Bar (Strictly Role-Tailored: Zero Interference) */}
        <View style={[styles.tabBar, { paddingBottom: bottomInset, minHeight: 56 + bottomInset }]}>
          {/* Owner / Manager Master Tabs (Intake Hub removed as requested, added P&L and Settings) */}
          {isOwnerOrManager && (
            <>
              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'dashboard' && styles.activeTabItem]}
                onPress={() => setCurrentTab('dashboard')}
              >
                <Text style={styles.tabIcon}>📊</Text>
                <Text style={[styles.tabLabel, currentTab === 'dashboard' && styles.activeTabLabel]}>Home</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'repairs' && styles.activeTabItem]}
                onPress={() => setCurrentTab('repairs')}
              >
                <Text style={styles.tabIcon}>🔧</Text>
                <Text style={[styles.tabLabel, currentTab === 'repairs' && styles.activeTabLabel]}>Repairs</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'analytics' && styles.activeTabItem]}
                onPress={() => setCurrentTab('analytics')}
              >
                <Text style={styles.tabIcon}>📈</Text>
                <Text style={[styles.tabLabel, currentTab === 'analytics' && styles.activeTabLabel]}>P&L</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'team' && styles.activeTabItem]}
                onPress={() => setCurrentTab('team')}
              >
                <Text style={styles.tabIcon}>👥</Text>
                <Text style={[styles.tabLabel, currentTab === 'team' && styles.activeTabLabel]}>Team</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'settings' && styles.activeTabItem]}
                onPress={() => setCurrentTab('settings')}
              >
                <Text style={styles.tabIcon}>⚙️</Text>
                <Text style={[styles.tabLabel, currentTab === 'settings' && styles.activeTabLabel]}>Settings</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Dedicated Hardware / Board Technician Tabs */}
          {isHardwareTech && (
            <>
              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'repairs' && styles.activeTabItem]}
                onPress={() => setCurrentTab('repairs')}
              >
                <Text style={styles.tabIcon}>🔧</Text>
                <Text style={[styles.tabLabel, currentTab === 'repairs' && styles.activeTabLabel]}>Workbench</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'search' && styles.activeTabItem]}
                onPress={() => setCurrentTab('search')}
              >
                <Text style={styles.tabIcon}>🔍</Text>
                <Text style={[styles.tabLabel, currentTab === 'search' && styles.activeTabLabel]}>Search</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'dashboard' && styles.activeTabItem]}
                onPress={() => setCurrentTab('dashboard')}
              >
                <Text style={styles.tabIcon}>👤</Text>
                <Text style={[styles.tabLabel, currentTab === 'dashboard' && styles.activeTabLabel]}>My Stats</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'settings' && styles.activeTabItem]}
                onPress={() => setCurrentTab('settings')}
              >
                <Text style={styles.tabIcon}>⚙️</Text>
                <Text style={[styles.tabLabel, currentTab === 'settings' && styles.activeTabLabel]}>Settings</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Dedicated QC Technician Tabs */}
          {isQCTech && (
            <>
              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'intake' && styles.activeTabItem]}
                onPress={() => setCurrentTab('intake')}
              >
                <Text style={styles.tabIcon}>📦</Text>
                <Text style={[styles.tabLabel, currentTab === 'intake' && styles.activeTabLabel]}>Stock & Intake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'qc' && styles.activeTabItem]}
                onPress={() => setCurrentTab('qc')}
              >
                <Text style={styles.tabIcon}>✅</Text>
                <Text style={[styles.tabLabel, currentTab === 'qc' && styles.activeTabLabel]}>QC Testing</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'search' && styles.activeTabItem]}
                onPress={() => setCurrentTab('search')}
              >
                <Text style={styles.tabIcon}>🔍</Text>
                <Text style={[styles.tabLabel, currentTab === 'search' && styles.activeTabLabel]}>Search</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'settings' && styles.activeTabItem]}
                onPress={() => setCurrentTab('settings')}
              >
                <Text style={styles.tabIcon}>⚙️</Text>
                <Text style={[styles.tabLabel, currentTab === 'settings' && styles.activeTabLabel]}>Settings</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Fallback Tabs for Viewer or New Accounts */}
          {!isOwnerOrManager && !isHardwareTech && !isQCTech && (
            <>
              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'dashboard' && styles.activeTabItem]}
                onPress={() => setCurrentTab('dashboard')}
              >
                <Text style={styles.tabIcon}>📊</Text>
                <Text style={[styles.tabLabel, currentTab === 'dashboard' && styles.activeTabLabel]}>Home</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'search' && styles.activeTabItem]}
                onPress={() => setCurrentTab('search')}
              >
                <Text style={styles.tabIcon}>🔍</Text>
                <Text style={[styles.tabLabel, currentTab === 'search' && styles.activeTabLabel]}>Search</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, currentTab === 'settings' && styles.activeTabItem]}
                onPress={() => setCurrentTab('settings')}
              >
                <Text style={styles.tabIcon}>⚙️</Text>
                <Text style={[styles.tabLabel, currentTab === 'settings' && styles.activeTabLabel]}>Settings</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <MainApp />
      </QueryClientProvider>
    </SafeAreaProvider>
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
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  activeTabItem: {
    borderTopColor: colors.primaryLight,
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeTabLabel: {
    color: colors.primaryLight,
    fontWeight: '800',
  },
});
