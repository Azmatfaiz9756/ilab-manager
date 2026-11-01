import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest, setServerHost, getCurrentHost } from '../services/api';
import { useAuthStore } from '../store/authStore';

export const AuthScreen: React.FC = () => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [userIdOrEmail, setUserIdOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [labName, setLabName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Server Host Config for Live Sync
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverHostInput, setServerHostInput] = useState('');

  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    setServerHostInput(getCurrentHost());
  }, []);

  const handleSaveHost = async () => {
    if (!serverHostInput.trim()) return;
    await setServerHost(serverHostInput.trim());
    Alert.alert('Server Config Saved', `Live sync server set to: ${serverHostInput.trim()}`);
    setShowServerConfig(false);
  };

  const handleLogin = async () => {
    if (!userIdOrEmail || !password) {
      Alert.alert('Validation Error', 'Please enter your User ID/Email and Password.');
      return;
    }

    setLoading(true);
    try {
      // Normalize username to email format if user entered simple username (e.g. "ahmed" -> "ahmed@repairlab.local")
      const formattedEmail = userIdOrEmail.includes('@')
        ? userIdOrEmail.trim().toLowerCase()
        : `${userIdOrEmail.trim().toLowerCase()}@repairlab.local`;

      const res = await apiRequest('/auth/login', {
        method: 'POST',
        requiresAuth: false,
        body: JSON.stringify({ email: formattedEmail, password }),
      });

      if (res.success) {
        await setSession(res.data.user, res.data.lab, res.data.tokens);
      }
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Please verify credentials or check server connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterLab = async () => {
    if (!labName || !name || !userIdOrEmail || !password) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const formattedEmail = userIdOrEmail.includes('@')
        ? userIdOrEmail.trim().toLowerCase()
        : `${userIdOrEmail.trim().toLowerCase()}@repairlab.local`;

      const res = await apiRequest('/auth/register-lab', {
        method: 'POST',
        requiresAuth: false,
        body: JSON.stringify({
          labName: labName.trim(),
          ownerName: name.trim(),
          email: formattedEmail,
          password,
          phone: phone.trim() || undefined,
        }),
      });

      if (res.success) {
        Alert.alert('Success', 'Laboratory & Account created successfully!');
        await setSession(res.data.user, res.data.lab, res.data.tokens);
      }
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerContainer}>
          <Text style={styles.brandTitle}>iLab Manager</Text>
          <Text style={styles.brandSubtitle}>
            iPhone Repair Lab Management & Real-Time Sync
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, !isRegisterMode && styles.activeTabButton]}
              onPress={() => setIsRegisterMode(false)}
            >
              <Text style={[styles.tabText, !isRegisterMode && styles.activeTabText]}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, isRegisterMode && styles.activeTabButton]}
              onPress={() => setIsRegisterMode(true)}
            >
              <Text style={[styles.tabText, isRegisterMode && styles.activeTabText]}>
                Register Lab
              </Text>
            </TouchableOpacity>
          </View>

          {isRegisterMode && (
            <>
              <Text style={styles.label}>Laboratory / Shop Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. My iPhone Repair Lab"
                placeholderTextColor={colors.textMuted}
                value={labName}
                onChangeText={setLabName}
              />

              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ahmed Raza"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </>
          )}

          <Text style={styles.label}>{isRegisterMode ? 'User ID or Email *' : 'User ID / Email *'}</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. admin or tech_ali"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            value={userIdOrEmail}
            onChangeText={setUserIdOrEmail}
          />

          <Text style={styles.label}>Password / PIN *</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {isRegisterMode && (
            <>
              <Text style={styles.label}>Phone Number (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 / +92 / etc."
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={isRegisterMode ? handleRegisterLab : handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isRegisterMode ? 'Create Lab & Start' : 'Sign In to Laboratory'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Real-time Server IP Configuration Drawer */}
          <TouchableOpacity
            style={styles.serverToggleBtn}
            onPress={() => setShowServerConfig(!showServerConfig)}
          >
            <Text style={styles.serverToggleText}>
              ⚙️ Server Sync: {getCurrentHost()} {showServerConfig ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.serverConfigBox}>
              <Text style={styles.serverConfigLabel}>Live Sync Server IP:Port</Text>
              <TextInput
                style={styles.serverInput}
                placeholder="192.168.0.165:4000"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                value={serverHostInput}
                onChangeText={setServerHostInput}
              />
              <TouchableOpacity style={styles.saveHostBtn} onPress={handleSaveHost}>
                <Text style={styles.saveHostBtnText}>Save Server IP</Text>
              </TouchableOpacity>
              <Text style={styles.serverHint}>
                Phones & QC computers on the same Wi-Fi will sync live in real-time.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primaryLight,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  activeTabButton: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  activeTabText: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  serverToggleBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: 8,
  },
  serverToggleText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  serverConfigBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  serverConfigLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  serverInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  saveHostBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  saveHostBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  serverHint: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
