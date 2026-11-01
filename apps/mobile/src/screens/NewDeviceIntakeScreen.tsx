import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest } from '../services/api';
import { validateIMEILuhn, DevicePriority } from '../shared';

export const NewDeviceIntakeScreen: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
  const [imei1, setImei1] = useState('');
  const [imei2, setImei2] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedFaultIds, setSelectedFaultIds] = useState<string[]>([]);
  const [customFault, setCustomFault] = useState('');
  const [priority, setPriority] = useState<DevicePriority>(DevicePriority.NORMAL);
  const [waterDamaged, setWaterDamaged] = useState(false);
  const [receivedFrom, setReceivedFrom] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedTechId, setAssignedTechId] = useState<string>('');

  const [imeiCheckLoading, setImeiCheckLoading] = useState(false);
  const [imeiWarning, setImeiWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch Models
  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['catalog_models'],
    queryFn: () => apiRequest('/catalog/models'),
  });

  // Fetch Faults
  const { data: faultsData, isLoading: faultsLoading } = useQuery({
    queryKey: ['catalog_faults'],
    queryFn: () => apiRequest('/catalog/faults'),
  });

  // Fetch Board Technicians
  const { data: teamData } = useQuery({
    queryKey: ['team_list'],
    queryFn: () => apiRequest('/team'),
  });

  const technicians = (teamData?.data || []).filter(
    (m: any) => m.role === 'BOARD_TECHNICIAN' && m.isActive
  );

  const handleCheckIMEI = async (val: string) => {
    setImei1(val);
    if (val.trim().length === 15) {
      const luhn = validateIMEILuhn(val);
      if (!luhn.isValid) {
        setImeiWarning(luhn.error || 'Invalid IMEI Luhn Checksum');
        return;
      }

      setImeiCheckLoading(true);
      try {
        const res = await apiRequest('/devices/check-imei', {
          method: 'POST',
          body: JSON.stringify({
            imei: val.trim(),
            faultIds: selectedFaultIds,
          }),
        });

        if (res.data?.isInLabNow) {
          setImeiWarning(
            `ACTIVE REPAIR NOTICE: Job ${res.data.currentActiveJob.jobNumber} is currently in progress (${res.data.currentActiveJob.status})`
          );
        } else if (res.data?.evaluation?.isReturnClaim) {
          setImeiWarning(res.data.evaluation.warningMessage);
        } else {
          setImeiWarning(null);
        }
      } catch (err: any) {
        setImeiWarning(err.message);
      } finally {
        setImeiCheckLoading(false);
      }
    } else {
      setImeiWarning(null);
    }
  };

  const toggleFault = (id: string) => {
    if (selectedFaultIds.includes(id)) {
      setSelectedFaultIds(selectedFaultIds.filter((f) => f !== id));
    } else {
      setSelectedFaultIds([...selectedFaultIds, id]);
    }
  };

  const handleSubmit = async () => {
    const luhn = validateIMEILuhn(imei1);
    if (!luhn.isValid) {
      Alert.alert('Validation Error', luhn.error || 'Please provide a valid 15-digit IMEI 1');
      return;
    }
    if (!selectedModelId) {
      Alert.alert('Validation Error', 'Please select an iPhone model');
      return;
    }
    if (selectedFaultIds.length === 0 && !customFault.trim()) {
      Alert.alert('Validation Error', 'Please select at least one fault or enter a custom fault');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest('/devices/intake', {
        method: 'POST',
        body: JSON.stringify({
          imei1: imei1.trim(),
          imei2: imei2.trim() || undefined,
          serialNumber: serialNumber.trim() || undefined,
          modelId: selectedModelId,
          faultIds: selectedFaultIds,
          customFaults: customFault.trim() ? [customFault.trim()] : [],
          priority,
          waterDamageStatus: waterDamaged,
          receivedFrom: receivedFrom.trim() || undefined,
          initialNotes: notes.trim() || undefined,
          assignedTechnicianId: assignedTechId || undefined,
        }),
      });

      if (res.success) {
        Alert.alert(
          'Intake Successful',
          `Created Job: ${res.data.jobNumber}\n${res.message}`,
          [{ text: 'OK', onPress: () => onSuccess?.() }]
        );
      }
    } catch (err: any) {
      Alert.alert('Intake Failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>New Device Intake</Text>

      {/* SECTION A: IMEI & SCANNER */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>1. Device Identification</Text>

        <Text style={styles.label}>IMEI 1 (Required) *</Text>
        <TextInput
          style={styles.input}
          placeholder="15-digit IMEI"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          maxLength={15}
          value={imei1}
          onChangeText={handleCheckIMEI}
        />

        {imeiCheckLoading && <ActivityIndicator size="small" color={colors.primaryLight} style={{ marginVertical: 4 }} />}

        {imeiWarning && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>{imeiWarning}</Text>
          </View>
        )}

        <Text style={styles.label}>IMEI 2 (Optional Dual-SIM)</Text>
        <TextInput
          style={styles.input}
          placeholder="15-digit secondary IMEI"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          maxLength={15}
          value={imei2}
          onChangeText={setImei2}
        />

        <Text style={styles.label}>Serial Number (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. F2L..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          value={serialNumber}
          onChangeText={setSerialNumber}
        />
      </View>

      {/* SECTION B: MODEL SELECTOR */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>2. iPhone Model Selection *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelScroll}>
          {(modelsData?.data || []).map((m: any) => {
            const isSelected = selectedModelId === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.modelChip, isSelected && styles.selectedModelChip]}
                onPress={() => setSelectedModelId(m.id)}
              >
                <Text style={[styles.modelChipText, isSelected && styles.selectedModelChipText]}>
                  {m.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* SECTION C: FAULT SELECTOR */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>3. Reported Faults *</Text>
        {(faultsData?.data || []).map((cat: any) => (
          <View key={cat.id} style={styles.categoryBlock}>
            <Text style={styles.categoryTitle}>{cat.name}</Text>
            <View style={styles.faultsGrid}>
              {cat.faults.map((f: any) => {
                const isSelected = selectedFaultIds.includes(f.id);
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.faultChip, isSelected && styles.selectedFaultChip]}
                    onPress={() => toggleFault(f.id)}
                  >
                    <Text style={[styles.faultChipText, isSelected && styles.selectedFaultChipText]}>
                      {f.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={[styles.label, { marginTop: spacing.md }]}>Custom / Other Fault</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter custom fault description..."
          placeholderTextColor={colors.textMuted}
          value={customFault}
          onChangeText={setCustomFault}
        />
      </View>

      {/* SECTION D: ASSIGNMENT & DETAILS */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>4. Assignment & Priority</Text>

        <Text style={styles.label}>Assign to Hardware Technician</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelScroll}>
          {technicians.map((t: any) => {
            const isSelected = assignedTechId === t.userId;
            return (
              <TouchableOpacity
                key={t.userId}
                style={[styles.techChip, isSelected && styles.selectedTechChip]}
                onPress={() => setAssignedTechId(isSelected ? '' : t.userId)}
              >
                <Text style={[styles.techChipText, isSelected && styles.selectedTechChipText]}>
                  {t.name} ({t.activeWorkload} active)
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Urgent Priority</Text>
          <Switch
            value={priority === DevicePriority.URGENT}
            onValueChange={(val) => setPriority(val ? DevicePriority.URGENT : DevicePriority.NORMAL)}
            trackColor={{ false: colors.surfaceBorder, true: colors.danger }}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Liquid / Water Damage Suspected</Text>
          <Switch
            value={waterDamaged}
            onValueChange={setWaterDamaged}
            trackColor={{ false: colors.surfaceBorder, true: colors.info }}
          />
        </View>

        <Text style={styles.label}>Received From / Customer Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Client or Store reference..."
          placeholderTextColor={colors.textMuted}
          value={receivedFrom}
          onChangeText={setReceivedFrom}
        />

        <Text style={styles.label}>Initial Inspection Notes</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Scratch notes, missing screws, accessories..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      <TouchableOpacity
        style={styles.submitBtn}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.submitBtnText}>Complete Intake & Create Repair Job</Text>
        )}
      </TouchableOpacity>
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
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryLight,
    marginBottom: spacing.md,
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
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  warningBox: {
    backgroundColor: colors.dangerBackground,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    marginBottom: spacing.sm,
  },
  warningText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  modelScroll: {
    marginVertical: spacing.xs,
  },
  modelChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  selectedModelChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  modelChipText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  selectedModelChipText: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  categoryBlock: {
    marginBottom: spacing.sm,
  },
  categoryTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  faultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  faultChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  selectedFaultChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  faultChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  selectedFaultChipText: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  techChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  selectedTechChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  techChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedTechChipText: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  switchLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '800',
  },
});
