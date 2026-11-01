import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { maskIMEI } from '../shared';

export const IMEISearchScreen: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  const [deviceDetailLoading, setDeviceDetailLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setSelectedDevice(null);
    try {
      const res = await apiRequest(`/devices?search=${encodeURIComponent(searchTerm.trim())}`);
      setSearchResults(res.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectDevice = async (id: string) => {
    setDeviceDetailLoading(true);
    try {
      const res = await apiRequest(`/devices/${id}`);
      setSelectedDevice(res.data);
    } catch {
      setSelectedDevice(null);
    } finally {
      setDeviceDetailLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>IMEI & History Search</Text>

      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter IMEI, Serial Number, or Job ID..."
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchBtnText}>Search</Text>}
        </TouchableOpacity>
      </View>

      {/* Results List */}
      {!selectedDevice && (
        <View>
          {searchResults.map((device) => {
            const primaryImei = device.imeis.find((i: any) => i.isPrimary)?.imei || device.imeis[0]?.imei;
            return (
              <TouchableOpacity
                key={device.id}
                style={styles.deviceCard}
                onPress={() => handleSelectDevice(device.id)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.modelName}>{device.model?.name}</Text>
                  <StatusBadge status={device.currentStatus} size="sm" />
                </View>
                <Text style={styles.imeiText}>IMEI: {primaryImei}</Text>
                <Text style={styles.statsText}>
                  Repairs: {device.totalRepairCount} • Returns: {device.totalReturnCount}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Device Profile & Chronological Timeline */}
      {deviceDetailLoading && <ActivityIndicator color={colors.primaryLight} size="large" style={{ marginVertical: 20 }} />}

      {selectedDevice && (
        <View style={styles.profileContainer}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedDevice(null)}>
            <Text style={styles.backBtnText}>← Back to search results</Text>
          </TouchableOpacity>

          <View style={styles.profileCard}>
            <Text style={styles.profileTitle}>{selectedDevice.model?.name}</Text>
            <Text style={styles.profileImei}>IMEI 1: {selectedDevice.imeis?.[0]?.imei}</Text>
            {selectedDevice.imeis?.[1] && <Text style={styles.profileImei}>IMEI 2: {selectedDevice.imeis[1].imei}</Text>}
            <Text style={styles.profileMeta}>Department: {selectedDevice.currentDepartment}</Text>
            <Text style={styles.profileMeta}>Total Repairs: {selectedDevice.totalRepairCount} | Returns: {selectedDevice.totalReturnCount}</Text>
          </View>

          <Text style={styles.timelineHeader}>Repair & Movement Timeline</Text>

          {/* Movements Timeline */}
          {(selectedDevice.movements || []).map((m: any, idx: number) => (
            <View key={m.id || idx} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineDate}>{new Date(m.movedAt).toLocaleString()}</Text>
                <Text style={styles.timelineReason}>{m.reason}</Text>
                <Text style={styles.timelineRoute}>
                  {m.fromDepartment} → {m.toDepartment}
                </Text>
                {m.notes && <Text style={styles.timelineNotes}>"{m.notes}"</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
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
    paddingTop: spacing.sm,
    paddingBottom: 110,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  searchBarContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    fontSize: 14,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  deviceCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  imeiText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statsText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  profileContainer: {
    marginTop: spacing.sm,
  },
  backBtn: {
    marginBottom: spacing.sm,
  },
  backBtnText: {
    color: colors.primaryLight,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  profileTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  profileImei: {
    fontSize: 13,
    color: colors.primaryLight,
    marginTop: 2,
    fontWeight: '600',
  },
  profileMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  timelineHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primaryLight,
    marginTop: 4,
    marginRight: 12,
  },
  timelineContent: {
    flex: 1,
  },
  timelineDate: {
    fontSize: 11,
    color: colors.textMuted,
  },
  timelineReason: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timelineRoute: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  timelineNotes: {
    fontSize: 12,
    color: colors.info,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
