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
import { StatusBadge } from '../components/StatusBadge';
import { maskIMEI, DeviceStatus } from '../shared';

export const MyRepairsScreen: React.FC = () => {
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [modalAction, setModalAction] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [partsDesc, setPartsDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my_repairs_list'],
    queryFn: () => apiRequest('/repairs/my-repairs'),
    refetchInterval: 3000,
  });

  const jobs = data?.data || [];

  const handleAction = async (action: string) => {
    if (!activeJob) return;
    setSubmitting(true);
    try {
      let endpoint = `/repairs/${activeJob.id}/${action}`;
      let body: any = {};

      if (action === 'submit-qc') {
        if (!diagnosis.trim() || !workPerformed.trim() || !notes.trim()) {
          Alert.alert('Required', 'Diagnosis, work performed, and repair notes are required to submit to QC.');
          setSubmitting(false);
          return;
        }
        body = { diagnosis, workPerformed, repairNotes: notes };
      } else if (action === 'not-possible') {
        if (!reason.trim()) {
          Alert.alert('Required', 'Reason is required for marking repair not possible.');
          setSubmitting(false);
          return;
        }
        body = { reason, notes };
      } else if (action === 'parts-required') {
        if (!partsDesc.trim()) {
          Alert.alert('Required', 'Parts description is required.');
          setSubmitting(false);
          return;
        }
        body = { partsDescription: partsDesc, notes };
      }

      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      Alert.alert('Success', `Action '${action}' recorded successfully`);
      setModalAction(null);
      setActiveJob(null);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading || isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.primaryLight} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
          <Text style={styles.screenTitle}>My Repair Station</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(34, 197, 94, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginRight: 5 }} />
            <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '700' }}>LIVE SYNC</Text>
          </View>
        </View>

        {jobs.length === 0 && !isLoading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No assigned repair jobs at this time.</Text>
          </View>
        )}

        {jobs.map((job: any) => {
          const device = job.device;
          const primaryImei = device.imeis.find((i: any) => i.isPrimary)?.imei || device.imeis[0]?.imei;
          const isReturn = job.isReturnClaim;

          return (
            <TouchableOpacity
              key={job.id}
              style={[styles.jobCard, isReturn && styles.returnClaimCardBorder]}
              onPress={() => setActiveJob(job)}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.modelName}>{device.model?.name || 'iPhone'}</Text>
                  <Text style={styles.imeiText}>IMEI: {maskIMEI(primaryImei)}</Text>
                </View>
                <StatusBadge status={job.status} />
              </View>

              {isReturn && (
                <View style={styles.returnBadge}>
                  <Text style={styles.returnBadgeText}>
                    RETURN CLAIM: {job.returnClaim?.claimType || 'SAME FAULT'}
                  </Text>
                </View>
              )}

              <View style={styles.cardFooter}>
                <Text style={styles.jobNumber}>{job.jobNumber}</Text>
                <Text style={styles.priorityText}>{device.priority}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* DETAIL / WORKFLOW MODAL */}
      <Modal visible={!!activeJob} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView>
              {activeJob && (
                <>
                  <Text style={styles.modalTitle}>{activeJob.device?.model?.name}</Text>
                  <Text style={styles.modalSubtitle}>Job: {activeJob.jobNumber}</Text>

                  {/* Previous Repair Warning for Return Claims */}
                  {activeJob.isReturnClaim && activeJob.returnClaim?.previousRepairJob && (
                    <View style={styles.historyBox}>
                      <Text style={styles.historyBoxTitle}>Previous Repair History</Text>
                      <Text style={styles.historyText}>
                        Previous Tech: {activeJob.returnClaim.previousRepairJob.assignments?.[0]?.technician?.name || 'N/A'}
                      </Text>
                      <Text style={styles.historyText}>
                        Diagnosis: {activeJob.returnClaim.previousRepairJob.attempts?.[0]?.diagnosis || 'N/A'}
                      </Text>
                    </View>
                  )}

                  {/* Dynamic Workflow Actions */}
                  {modalAction === null && (
                    <View style={styles.actionsContainer}>
                      {activeJob.status === DeviceStatus.ASSIGNED_TO_TECHNICIAN && (
                        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => handleAction('accept')}>
                          <Text style={styles.actionBtnText}>Accept Job</Text>
                        </TouchableOpacity>
                      )}

                      {(activeJob.status === DeviceStatus.ACCEPTED_BY_TECHNICIAN ||
                        activeJob.status === DeviceStatus.ON_HOLD ||
                        activeJob.status === DeviceStatus.RETURN_TO_TECHNICIAN) && (
                        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => handleAction('start')}>
                          <Text style={styles.actionBtnText}>Start Repair Work</Text>
                        </TouchableOpacity>
                      )}

                      {activeJob.status === DeviceStatus.REPAIR_IN_PROGRESS && (
                        <>
                          <TouchableOpacity
                            style={styles.actionBtnSuccess}
                            onPress={() => setModalAction('submit-qc')}
                          >
                            <Text style={styles.actionBtnText}>Complete & Submit to QC</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnWarning}
                            onPress={() => setModalAction('parts-required')}
                          >
                            <Text style={styles.actionBtnText}>Request Parts</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnSecondary}
                            onPress={() => handleAction('hold')}
                          >
                            <Text style={styles.actionBtnText}>Put on Hold</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnDanger}
                            onPress={() => setModalAction('not-possible')}
                          >
                            <Text style={styles.actionBtnText}>Mark Not Possible</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}

                  {/* Form for Submit to QC */}
                  {modalAction === 'submit-qc' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formTitle}>QC Submission Form</Text>
                      <Text style={styles.label}>Diagnosis *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Short on VDD_MAIN line capacitor"
                        placeholderTextColor={colors.textMuted}
                        value={diagnosis}
                        onChangeText={setDiagnosis}
                      />
                      <Text style={styles.label}>Work Performed *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Removed shorted C3100, reballed PMIC"
                        placeholderTextColor={colors.textMuted}
                        value={workPerformed}
                        onChangeText={setWorkPerformed}
                      />
                      <Text style={styles.label}>Repair Notes *</Text>
                      <TextInput
                        style={[styles.input, { minHeight: 60 }]}
                        placeholder="Complete notes for QC inspector..."
                        placeholderTextColor={colors.textMuted}
                        multiline
                        value={notes}
                        onChangeText={setNotes}
                      />
                      <TouchableOpacity
                        style={styles.actionBtnSuccess}
                        onPress={() => handleAction('submit-qc')}
                        disabled={submitting}
                      >
                        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Confirm QC Submission</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Form for Not Possible */}
                  {modalAction === 'not-possible' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formTitle}>Mark Repair Not Possible</Text>
                      <Text style={styles.label}>Clear Technical Reason *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Internal board layer delamination under CPU"
                        placeholderTextColor={colors.textMuted}
                        value={reason}
                        onChangeText={setReason}
                      />
                      <TouchableOpacity
                        style={styles.actionBtnDanger}
                        onPress={() => handleAction('not-possible')}
                        disabled={submitting}
                      >
                        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Confirm Not Possible</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Form for Parts Required */}
                  {modalAction === 'parts-required' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formTitle}>Parts Required Form</Text>
                      <Text style={styles.label}>Parts Description *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. iPhone 14 Pro Max Charging IC (U3300)"
                        placeholderTextColor={colors.textMuted}
                        value={partsDesc}
                        onChangeText={setPartsDesc}
                      />
                      <TouchableOpacity
                        style={styles.actionBtnWarning}
                        onPress={() => handleAction('parts-required')}
                        disabled={submitting}
                      >
                        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Submit Parts Request</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                setModalAction(null);
                setActiveJob(null);
              }}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  jobCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  returnClaimCardBorder: {
    borderColor: colors.danger,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modelName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  imeiText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  returnBadge: {
    backgroundColor: colors.dangerBackground,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginVertical: 6,
  },
  returnBadgeText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '800',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.xs,
  },
  jobNumber: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  priorityText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  historyBox: {
    backgroundColor: colors.dangerBackground,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    marginBottom: spacing.md,
  },
  historyBoxTitle: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 2,
  },
  historyText: {
    color: colors.textPrimary,
    fontSize: 12,
  },
  actionsContainer: {
    gap: 8,
    marginTop: spacing.sm,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnSuccess: {
    backgroundColor: colors.success,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnWarning: {
    backgroundColor: colors.warning,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnSecondary: {
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnDanger: {
    backgroundColor: colors.danger,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  closeBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  formContainer: {
    marginTop: spacing.sm,
  },
  formTitle: {
    color: colors.primaryLight,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: spacing.sm,
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
});
