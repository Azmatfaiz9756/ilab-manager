import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest } from '../services/api';
import { UserRole } from '../shared';

export const TeamScreen: React.FC = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.BOARD_TECHNICIAN);
  const [employeeId, setEmployeeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['team_members_list'],
    queryFn: () => apiRequest('/team'),
    refetchInterval: 5000,
  });

  const team = data?.data || [];

  const handleAddEmployee = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Required', 'Please fill in name, email, and password.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/team', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          employeeId: employeeId.trim() || undefined,
        }),
      });

      Alert.alert('Success', 'Team member added to laboratory.');
      setModalVisible(false);
      setName('');
      setEmail('');
      setPassword('');
      setEmployeeId('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading || isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.primaryLight} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Team Management</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.addBtnText}>+ Add Member</Text>
        </TouchableOpacity>
      </View>

      {team.map((member: any) => (
        <View key={member.userId} style={styles.memberCard}>
          <View style={styles.cardRow}>
            <Text style={styles.memberName}>{member.name}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{member.role.replace(/_/g, ' ')}</Text>
            </View>
          </View>
          <Text style={styles.emailText}>{member.email}</Text>
          <View style={styles.workloadRow}>
            <Text style={styles.workloadText}>Active Jobs: {member.activeWorkload}</Text>
            <Text style={[styles.statusText, { color: member.isActive ? colors.success : colors.danger }]}>
              {member.isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      ))}

      {/* Add Employee Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Team Member</Text>

            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ali Reza"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>User ID or Email *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. tech_rahul or tech@lab.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Password or PIN *</Text>
            <TextInput
              style={styles.input}
              placeholder="Min 4 chars / PIN (e.g. 1234)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Text style={styles.label}>Role *</Text>
            <View style={styles.rolePickerRow}>
              {[UserRole.BOARD_TECHNICIAN, UserRole.QC_TECHNICIAN, UserRole.LAB_MANAGER].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleSelectChip, role === r && styles.selectedRoleChip]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.roleSelectText, role === r && styles.selectedRoleSelectText]}>
                    {r === UserRole.BOARD_TECHNICIAN ? 'Board Tech' : r === UserRole.QC_TECHNICIAN ? 'QC' : 'Manager'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddEmployee} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Add Employee</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  memberCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  roleBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  roleText: {
    fontSize: 11,
    color: colors.primaryLight,
    fontWeight: '700',
  },
  emailText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginVertical: 4,
  },
  workloadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: 4,
  },
  workloadText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    padding: 10,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  roleSelectChip: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  selectedRoleChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  roleSelectText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  selectedRoleSelectText: {
    color: '#fff',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  cancelBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.textSecondary,
  },
});
