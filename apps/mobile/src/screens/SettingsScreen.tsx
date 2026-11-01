import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore, CURRENCY_LIST, CurrencyCode } from '../store/settingsStore';
import { printSingleDeviceLabel } from '../services/labelPrinter';

export const SettingsScreen: React.FC = () => {
  const { user, lab, logout } = useAuthStore();
  const {
    currency,
    setCurrency,
    printerWidth,
    setPrinterWidth,
    labName,
    labPhone,
    labAddress,
    receiptFooter,
    updateLabInfo,
  } = useSettingsStore();

  const [nameInput, setNameInput] = useState(labName);
  const [phoneInput, setPhoneInput] = useState(labPhone);
  const [addressInput, setAddressInput] = useState(labAddress);
  const [footerInput, setFooterInput] = useState(receiptFooter);
  const [saving, setSaving] = useState(false);

  const handleSaveLabInfo = async () => {
    setSaving(true);
    try {
      await updateLabInfo({
        labName: nameInput.trim(),
        labPhone: phoneInput.trim(),
        labAddress: addressInput.trim(),
        receiptFooter: footerInput.trim(),
      });
      Alert.alert('Settings Saved', 'Lab profile and printing settings updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async () => {
    await printSingleDeviceLabel(
      {
        jobNumber: 'TEST-2026-0001',
        imei: '359278280366351',
        modelName: 'iPhone 16 Pro Max',
        faults: ['Face ID Hide', 'Audio IC'],
        customerName: 'Test Customer',
        technicianName: user?.name || 'Technician',
        priority: 'URGENT',
      },
      {
        labName: nameInput,
        labPhone: phoneInput,
        paperWidth: printerWidth,
      }
    );
  };

  const handleLogout = () => {
    Alert.alert('Confirm Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>System Settings</Text>
        <Text style={styles.headerSubtitle}>Configure Currency, Thermal Printer & Lab Details</Text>
      </View>

      {/* 1. CURRENCY SELECTION */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💰 Default Currency</Text>
        <Text style={styles.cardSub}>
          Select the currency used across all earnings, rate cards, and reports.
        </Text>

        <View style={styles.currencyGrid}>
          {CURRENCY_LIST.map((c) => {
            const isSelected = currency === c.code;
            return (
              <TouchableOpacity
                key={c.code}
                style={[styles.currencyChip, isSelected && styles.currencyChipSelected]}
                onPress={() => setCurrency(c.code)}
              >
                <Text style={styles.currencyFlag}>{c.flag}</Text>
                <Text style={[styles.currencyCode, isSelected && styles.currencyCodeSelected]}>
                  {c.code} ({c.symbol})
                </Text>
                <Text style={styles.currencyName}>{c.name}</Text>
                {isSelected && <Text style={styles.activeCheck}>✓ ACTIVE</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 2. BLUETOOTH / THERMAL PRINTER SETTINGS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🖨️ Thermal Label Printer</Text>
        <Text style={styles.cardSub}>
          Format labels for Bluetooth thermal barcode/sticker printers.
        </Text>

        <Text style={styles.label}>Paper Width (Roll Size):</Text>
        <View style={styles.printerWidthRow}>
          {(['58mm', '80mm'] as const).map((w) => {
            const isSelected = printerWidth === w;
            return (
              <TouchableOpacity
                key={w}
                style={[styles.widthChip, isSelected && styles.widthChipSelected]}
                onPress={() => setPrinterWidth(w)}
              >
                <Text style={[styles.widthChipText, isSelected && styles.widthChipTextSelected]}>
                  {w === '58mm' ? '📱 58mm (2-Inch Pocket Printer)' : '🖥️ 80mm (3-Inch Standard Printer)'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.testPrintBtn} onPress={handleTestPrint}>
          <Text style={styles.testPrintBtnText}>🖨️ Print Sample Label via Bluetooth</Text>
        </TouchableOpacity>
      </View>

      {/* 3. LAB PROFILE & HEADER DETAILS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏢 Lab & Receipt Profile</Text>
        <Text style={styles.cardSub}>
          Details printed on device barcode stickers and customer receipts.
        </Text>

        <Text style={styles.label}>Laboratory Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. iLab Pro Repair Center"
          placeholderTextColor={colors.textMuted}
          value={nameInput}
          onChangeText={setNameInput}
        />

        <Text style={styles.label}>Support / WhatsApp Phone</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. +971 50 123 4567"
          placeholderTextColor={colors.textMuted}
          value={phoneInput}
          onChangeText={setPhoneInput}
        />

        <Text style={styles.label}>Shop / Lab Address</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Deira, Dubai, UAE"
          placeholderTextColor={colors.textMuted}
          value={addressInput}
          onChangeText={setAddressInput}
        />

        <Text style={styles.label}>Sticker / Receipt Footer Text</Text>
        <TextInput
          style={[styles.input, { minHeight: 60 }]}
          placeholder="e.g. 30-Day Testing Warranty"
          placeholderTextColor={colors.textMuted}
          multiline
          value={footerInput}
          onChangeText={setFooterInput}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveLabInfo} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : '💾 Save Settings'}</Text>
        </TouchableOpacity>
      </View>

      {/* 4. USER ACCOUNT & LOGOUT */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 Active User Account</Text>
        <View style={styles.accountRow}>
          <View>
            <Text style={styles.accountName}>{user?.name}</Text>
            <Text style={styles.accountMeta}>{user?.email} • Role: {user?.role}</Text>
            {lab?.name && <Text style={styles.accountLab}>Lab: {lab.name}</Text>}
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>🚪 Sign Out / Switch Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  header: {
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cardSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currencyChip: {
    width: '48%',
    backgroundColor: colors.surfaceElevated,
    padding: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
  },
  currencyChipSelected: {
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    borderColor: colors.primary,
  },
  currencyFlag: {
    fontSize: 20,
    marginBottom: 4,
  },
  currencyCode: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  currencyCodeSelected: {
    color: colors.primaryLight,
  },
  currencyName: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  activeCheck: {
    color: '#22c55e',
    fontSize: 9,
    fontWeight: '900',
    marginTop: 4,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    padding: 10,
    fontSize: 13,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  printerWidthRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.sm,
  },
  widthChip: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
  },
  widthChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  widthChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  widthChipTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  testPrintBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: 4,
  },
  testPrintBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  accountRow: {
    marginBottom: spacing.md,
  },
  accountName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  accountMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  accountLab: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutBtnText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 12,
  },
});
