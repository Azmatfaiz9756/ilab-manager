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
import { useSettingsStore } from '../store/settingsStore';

export const TeamScreen: React.FC = () => {
  const { formatMoney, currency } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'MEMBERS' | 'PAYOUTS' | 'RATE_CARDS'>('MEMBERS');

  // Add Member Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.BOARD_TECHNICIAN);
  const [employeeId, setEmployeeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Issue Payout Modal State
  const [payoutModalVisible, setPayoutModalVisible] = useState(false);
  const [selectedTech, setSelectedTech] = useState<any | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMode, setPayoutMode] = useState<'UPI' | 'CASH' | 'BANK'>('UPI');
  const [payoutNotes, setPayoutNotes] = useState('');

  // Add Rate Card Modal State
  const [rateCardModalVisible, setRateCardModalVisible] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [faultNameInput, setFaultNameInput] = useState('');
  const [repairPriceInput, setRepairPriceInput] = useState('');
  const [techEarningInput, setTechEarningInput] = useState('');

  // Queries
  const { data: teamData, isLoading: teamLoading, refetch: refetchTeam, isRefetching: teamRefetching } = useQuery({
    queryKey: ['team_members_list'],
    queryFn: () => apiRequest('/team'),
    refetchInterval: 5000,
  });

  const { data: payoutSummaryData, isLoading: payoutLoading, refetch: refetchPayouts } = useQuery({
    queryKey: ['manager_payout_summary'],
    queryFn: () => apiRequest('/repairs/payouts/summary'),
    refetchInterval: 5000,
  });

  const { data: rateCardData, isLoading: rateCardLoading, refetch: refetchRateCards } = useQuery({
    queryKey: ['fault_rate_card_list'],
    queryFn: () => apiRequest('/repairs/rate-card/list'),
    refetchInterval: 8000,
  });

  const { data: modelsData } = useQuery({
    queryKey: ['catalog_models_rate_card'],
    queryFn: () => apiRequest('/catalog/models'),
  });

  const team = teamData?.data || [];
  const techniciansSummary = payoutSummaryData?.data?.technicians || [];
  const rateCards = rateCardData?.data || [];
  const models = modelsData?.data || [];

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
      refetchTeam();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePayout = async () => {
    if (!selectedTech || !payoutAmount || Number(payoutAmount) <= 0) {
      Alert.alert('Required', 'Please enter a valid payout amount.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/repairs/payouts', {
        method: 'POST',
        body: JSON.stringify({
          technicianId: selectedTech.id,
          amount: Number(payoutAmount),
          paymentMode: payoutMode,
          notes: payoutNotes.trim() || undefined,
        }),
      });

      Alert.alert('Payout Sent', `${formatMoney(Number(payoutAmount) || 0)} payout sent to ${selectedTech.name}. Awaiting technician acceptance.`);
      setPayoutModalVisible(false);
      setSelectedTech(null);
      setPayoutAmount('');
      setPayoutNotes('');
      refetchPayouts();
    } catch (err: any) {
      Alert.alert('Payout Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddRateCard = async () => {
    if (!selectedModelId || !faultNameInput.trim() || !repairPriceInput || !techEarningInput) {
      Alert.alert('Required', 'Please select a model, type the fault name, and enter both repair price and technician earning.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/repairs/rate-card', {
        method: 'POST',
        body: JSON.stringify({
          modelId: selectedModelId,
          faultName: faultNameInput.trim(),
          repairPrice: Number(repairPriceInput),
          techEarning: Number(techEarningInput),
        }),
      });

      Alert.alert('Rate Card Saved', `Rate card for ${faultNameInput} saved successfully.`);
      setRateCardModalVisible(false);
      setFaultNameInput('');
      setRepairPriceInput('');
      setTechEarningInput('');
      refetchRateCards();
    } catch (err: any) {
      Alert.alert('Rate Card Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRateCard = async (id: string) => {
    try {
      await apiRequest(`/repairs/rate-card/${id}`, { method: 'DELETE' });
      refetchRateCards();
    } catch (err: any) {
      Alert.alert('Delete Error', err.message);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={teamLoading || teamRefetching || payoutLoading || rateCardLoading}
          onRefresh={() => {
            refetchTeam();
            refetchPayouts();
            refetchRateCards();
          }}
          tintColor={colors.primaryLight}
        />
      }
    >
      {/* Screen Title */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.screenTitle}>Lab Management</Text>
          <Text style={styles.screenSub}>Team, Pricing Rate Cards & Technician Payouts</Text>
        </View>
      </View>

      {/* Top Segmented Navigation */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'MEMBERS' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('MEMBERS')}
        >
          <Text style={[styles.segmentText, activeTab === 'MEMBERS' && styles.segmentTextActive]}>
            👥 Team ({team.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'PAYOUTS' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('PAYOUTS')}
        >
          <Text style={[styles.segmentText, activeTab === 'PAYOUTS' && styles.segmentTextActive]}>
            💸 Payouts Ledger
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'RATE_CARDS' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('RATE_CARDS')}
        >
          <Text style={[styles.segmentText, activeTab === 'RATE_CARDS' && styles.segmentTextActive]}>
            📋 Rate Cards ({rateCards.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ============================================================== */}
      {/* 1. TEAM MEMBERS TAB                                            */}
      {/* ============================================================== */}
      {activeTab === 'MEMBERS' && (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.sm }}>
            <Text style={styles.sectionHeaderTitle}>Laboratory Personnel</Text>
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
        </View>
      )}

      {/* ============================================================== */}
      {/* 2. TECHNICIAN PAYOUTS & WORK LEDGER TAB                        */}
      {/* ============================================================== */}
      {activeTab === 'PAYOUTS' && (
        <View>
          <View style={{ marginVertical: spacing.sm }}>
            <Text style={styles.sectionHeaderTitle}>Technician Work Done & Payout Ledger</Text>
            <Text style={styles.sectionHeaderSub}>
              Tracks total labor earned per technician, payouts issued, and balance due.
            </Text>
          </View>

          {techniciansSummary.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyBoxText}>No technician accounts found.</Text>
            </View>
          ) : (
            techniciansSummary.map((techItem: any) => {
              const tech = techItem.technician || {};
              return (
                <View key={tech.id} style={styles.techPayoutCard}>
                  <View style={styles.cardRow}>
                    <View>
                      <Text style={styles.techName}>{tech.name}</Text>
                      <Text style={styles.techRole}>Role: {tech.role || 'TECHNICIAN'}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.payOutActionBtn}
                      onPress={() => {
                        setSelectedTech(tech);
                        setPayoutAmount(techItem.balanceDue > 0 ? String(techItem.balanceDue) : '');
                        setPayoutModalVisible(true);
                      }}
                    >
                      <Text style={styles.payOutActionBtnText}>💸 Issue Payout</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Financial Breakdown Badges */}
                  <View style={styles.techStatsRow}>
                    <View style={styles.techStatCol}>
                      <Text style={styles.techStatLabel}>Work Done</Text>
                      <Text style={[styles.techStatVal, { color: '#38bdf8' }]}>
                        {formatMoney(techItem.totalWorkDone || 0)}
                      </Text>
                    </View>
                    <View style={styles.techStatCol}>
                      <Text style={styles.techStatLabel}>Paid Out</Text>
                      <Text style={[styles.techStatVal, { color: '#22c55e' }]}>
                        {formatMoney(techItem.totalPaid || 0)}
                      </Text>
                    </View>
                    <View style={styles.techStatCol}>
                      <Text style={styles.techStatLabel}>Pending Receipt</Text>
                      <Text style={[styles.techStatVal, { color: '#fb923c' }]}>
                        {formatMoney(techItem.pendingPayouts || 0)}
                      </Text>
                    </View>
                    <View style={styles.techStatCol}>
                      <Text style={styles.techStatLabel}>Balance Due</Text>
                      <Text style={[styles.techStatVal, { color: '#f59e0b' }]}>
                        {formatMoney(techItem.balanceDue || 0)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* 3. FAULT RATE CARDS TAB                                        */}
      {/* ============================================================== */}
      {activeTab === 'RATE_CARDS' && (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.sm }}>
            <View>
              <Text style={styles.sectionHeaderTitle}>Model-Wise Fault Pricing</Text>
              <Text style={styles.sectionHeaderSub}>Auto-sets customer prices and technician earnings</Text>
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={() => setRateCardModalVisible(true)}>
              <Text style={styles.addBtnText}>+ Add Rate</Text>
            </TouchableOpacity>
          </View>

          {rateCards.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyBoxText}>
                No fault rate cards defined yet. Tap '+ Add Rate' to configure default prices for Face ID, Audio IC, etc.
              </Text>
            </View>
          ) : (
            rateCards.map((rc: any) => (
              <View key={rc.id} style={styles.rateCardItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rateCardModel}>{rc.model?.name || 'iPhone'}</Text>
                  <Text style={styles.rateCardFault}>⚡ {rc.faultName || rc.fault?.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, color: '#38bdf8', fontWeight: '700' }}>
                      Customer Price: {formatMoney(rc.repairPrice)}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#4ade80', fontWeight: '700' }}>
                      Tech Earning: {formatMoney(rc.techEarning)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.deleteRateBtn}
                  onPress={() => handleDeleteRateCard(rc.id)}
                >
                  <Text style={styles.deleteRateText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD TEAM MEMBER                                         */}
      {/* ============================================================== */}
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

            <Text style={styles.label}>Temporary Password *</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
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
                    {r === UserRole.BOARD_TECHNICIAN ? 'Hardware Tech' : r === UserRole.QC_TECHNICIAN ? 'QC Tech' : 'Manager'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddEmployee} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Add Team Member</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL: ISSUE PAYOUT                                            */}
      {/* ============================================================== */}
      <Modal visible={payoutModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>💸 Issue Technician Payout</Text>
            <Text style={styles.modalSubTitle}>Technician: {selectedTech?.name}</Text>

            <Text style={styles.label}>Payout Amount ({currency}) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 3500"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={payoutAmount}
              onChangeText={setPayoutAmount}
            />

            <Text style={styles.label}>Payment Mode *</Text>
            <View style={styles.rolePickerRow}>
              {(['UPI', 'CASH', 'BANK'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.roleSelectChip, payoutMode === mode && styles.selectedRoleChip]}
                  onPress={() => setPayoutMode(mode)}
                >
                  <Text style={[styles.roleSelectText, payoutMode === mode && styles.selectedRoleSelectText]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Transaction / Reference Notes (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. GPay UPI Ref: 4892910"
              placeholderTextColor={colors.textMuted}
              value={payoutNotes}
              onChangeText={setPayoutNotes}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleCreatePayout} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Confirm & Send Payout</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setPayoutModalVisible(false);
                setSelectedTech(null);
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL: ADD FAULT RATE CARD                                     */}
      {/* ============================================================== */}
      <Modal visible={rateCardModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📋 Add Fault Rate Card</Text>

            <Text style={styles.label}>1. Select iPhone Model *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {models.map((m: any) => {
                const isSelected = m.id === selectedModelId;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.modelSelectChip, isSelected && styles.selectedRoleChip]}
                    onPress={() => setSelectedModelId(m.id)}
                  >
                    <Text style={[styles.roleSelectText, isSelected && styles.selectedRoleSelectText]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>2. Fault Name (e.g. Face ID Hide, FID Not Available) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Face ID Hide / Audio IC / Screen"
              placeholderTextColor={colors.textMuted}
              value={faultNameInput}
              onChangeText={setFaultNameInput}
            />

            <Text style={styles.label}>3. Customer / Repair Price ({currency}) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1500"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={repairPriceInput}
              onChangeText={setRepairPriceInput}
            />

            <Text style={styles.label}>4. Technician Labor Earning ({currency}) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 600"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={techEarningInput}
              onChangeText={setTechEarningInput}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddRateCard} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Save Rate Card</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setRateCardModalVisible(false)}>
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
    paddingBottom: spacing.xl * 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  screenSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  segmentedContainer: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  sectionHeaderTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHeaderSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  memberCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  roleBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primaryLight,
  },
  emailText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  workloadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.xs,
  },
  workloadText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  techPayoutCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  techName: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  techRole: {
    color: colors.textMuted,
    fontSize: 11,
  },
  payOutActionBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  payOutActionBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  techStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  techStatCol: {
    alignItems: 'center',
  },
  techStatLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  techStatVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  rateCardItem: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rateCardModel: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  rateCardFault: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  deleteRateBtn: {
    padding: spacing.sm,
  },
  deleteRateText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyBox: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  emptyBoxText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
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
    marginBottom: 2,
  },
  modalSubTitle: {
    fontSize: 12,
    color: colors.primaryLight,
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
  modelSelectChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    marginRight: 6,
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
